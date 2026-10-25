#!/usr/bin/env node
// Records an explanation video of the workbench: a scripted tour with demo data, captions and a visible cursor.
// Usage: node scripts/walkthrough.mjs [out-dir]   → <out-dir>/walkthrough.webm (+ .mp4 when ffmpeg is installed)
// Voice-over: NARRATION=<dir>/manifest.json (from scripts/narrate.py) – every title()/say() then holds as long as its
// clip and the clips are mixed into the mp4 at the moment their caption appears.
import { chromium } from 'playwright-core';
import { mkdirSync, renameSync, readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildSubtitles, spokenText } from './subtitles.mjs';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { generateDemoWorkbooks } from '../src/model/demo.js';
// TOUR=full (default, ~5 min) or TOUR=short (~90 s overview) – scripts/tours/<name>.mjs: meta + run().
const tour = await import(`./tours/${process.env.TOUR || 'full'}.mjs`);

const out = resolve(process.argv[2] || 'dist/video'); mkdirSync(out, { recursive: true });
// Second fictional country for the country switch (dropped in near the end of the tour).
const sgDir = resolve(out, '_second-country'); mkdirSync(sgDir, { recursive: true });
const sgFiles = [];
for (const f of await generateDemoWorkbooks(XLSX, JSZip, { country: 'Singapore', entities: [{ code: '302001', name: 'Demo Singapore Pte Ltd' }, { code: '302002', name: 'Demo Hub Singapore Pte Ltd' }] })) { if (/CMD/.test(f.name)) continue; const p = resolve(sgDir, f.name); writeFileSync(p, f.data); sgFiles.push(p); }
const W = Number(process.env.VIDEO_W || 1920), H = Number(process.env.VIDEO_H || 1080);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--force-device-scale-factor=1'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: out, size: { width: W, height: H } }, locale: 'en-GB', timezoneId: 'Europe/Zurich' });
const page = await ctx.newPage();
const t0 = Date.now(); // the video starts with the page
const NARR = process.env.NARRATION ? JSON.parse(readFileSync(process.env.NARRATION, 'utf8')) : null;
let cueNo = 0; const cues = [];
// Next voice clip: remember when it starts, return how long the scene has to hold.
const speak = (fallbackMs) => {
  if (!NARR) return fallbackMs;
  const id = NARR.order[cueNo++]; const clip = id && NARR.clips[id]; if (!clip) return fallbackMs;
  cues.push({ id, file: clip.file, at: Date.now() - t0 + Number(process.env.AUDIO_OFFSET_MS || 0) });
  return Math.round(clip.duration * 1000) + 450;
};
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.route(/^https?:\/\//, r => r.abort());

const sleep = (ms) => page.waitForTimeout(ms);
// ---- overlay: caption bar + cursor, injected into the page (survives re-renders because it sits outside the app root)
const overlay = async () => page.evaluate(() => {
  if (document.getElementById('vt-cap')) return;
  const css = document.createElement('style'); css.textContent = `
    #vt-cap { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%) translateY(20px); z-index: 99999; max-width: 70vw; background: rgba(20,26,32,.92); color: #fff; padding: 14px 22px 14px 18px; border-radius: 14px; font: 500 20px/1.35 'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif; box-shadow: 0 16px 40px rgba(0,0,0,.35); display: flex; gap: 14px; align-items: center; opacity: 0; transition: opacity .35s, transform .35s; pointer-events: none; }
    #vt-cap.on { opacity: 1; transform: translateX(-50%) translateY(0); }
    #vt-cap .n { font: 500 13px/1 'IBM Plex Mono', monospace; letter-spacing: .08em; background: #9dbbd6; color: #141a20; padding: 6px 8px; border-radius: 6px; white-space: nowrap; }
    #vt-cur { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 100000; pointer-events: none; transition: left .55s cubic-bezier(.2,.7,.2,1), top .55s cubic-bezier(.2,.7,.2,1); filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    #vt-cur.click { animation: vt-click .35s ease; }
    @keyframes vt-click { 0% { transform: scale(1); } 40% { transform: scale(.75); } 100% { transform: scale(1); } }
    #vt-ring { position: fixed; width: 40px; height: 40px; border-radius: 50%; border: 3px solid #1f4e79; z-index: 99999; pointer-events: none; opacity: 0; transform: translate(-50%, -50%) scale(.4); }
    #vt-ring.on { animation: vt-ring .6s ease-out; }
    @keyframes vt-ring { 0% { opacity: .9; transform: translate(-50%,-50%) scale(.4); } 100% { opacity: 0; transform: translate(-50%,-50%) scale(1.6); } }
    #vt-title { position: fixed; inset: 0; z-index: 100001; background: linear-gradient(118deg, #1f4e79 0%, #163a5b 60%, #141a20 100%); color: #fff; display: flex; flex-direction: column; justify-content: center; padding: 0 10vw; font-family: 'Instrument Sans Variable', system-ui, sans-serif; opacity: 1; transition: opacity .6s; }
    #vt-title.off { opacity: 0; pointer-events: none; }
    #vt-title h1 { font: 500 64px/1.1 'Source Serif 4 Variable', Georgia, serif; margin: 18px 0 14px; letter-spacing: -.01em; }
    #vt-title .eb { font: 600 15px/1 'Instrument Sans Variable', sans-serif; letter-spacing: .12em; text-transform: uppercase; opacity: .75; }
    #vt-title p { font-size: 24px; opacity: .8; max-width: 52rem; margin: 0; }
    #vt-title .mark { width: 72px; height: 72px; }
    .toasts { bottom: 128px !important; }
    #vt-cap[popover], #vt-cur[popover], #vt-ring[popover] { margin: 0; border: 0; overflow: visible; color: inherit; inset: auto; }
    #vt-cap[popover] { left: 50%; bottom: 28px; background: rgba(20,26,32,.92); color: #fff; padding: 14px 22px 14px 18px; }
    #vt-cur[popover] { background: none; padding: 0; } #vt-ring[popover] { background: none; padding: 0; border: 3px solid #1f4e79; }`;
  document.head.appendChild(css);
  const cap = document.createElement('div'); cap.id = 'vt-cap'; cap.innerHTML = '<span class="n"></span><span class="t"></span>'; document.body.appendChild(cap);
  const cur = document.createElement('div'); cur.id = 'vt-cur'; cur.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8.5-6.2 1.6L9.3 19 5 3z" fill="#fff" stroke="#141a20" stroke-width="1.6" stroke-linejoin="round"/></svg>`; cur.style.left = '700px'; cur.style.top = '500px'; document.body.appendChild(cur);
  const ring = document.createElement('div'); ring.id = 'vt-ring'; document.body.appendChild(ring);
  // Popovers live in the browser's top layer, so caption, cursor and click ring stay above modal dialogs and their backdrop.
  for (const el of [cap, ring, cur]) { el.setAttribute('popover', 'manual'); try { el.showPopover(); } catch { /* older browser: stays a normal fixed element */ } }
});
const title = async (eyebrow, h, p) => page.evaluate(([eyebrow, h, p]) => {
  let t = document.getElementById('vt-title'); if (!t) { t = document.createElement('div'); t.id = 'vt-title'; document.body.appendChild(t); }
  t.className = ''; t.innerHTML = `<svg class="mark" viewBox="0 0 32 32"><defs><linearGradient id="vtg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9dbbd6"/><stop offset="1" stop-color="#2f7a7a"/></linearGradient></defs><rect width="32" height="32" rx="7" fill="url(#vtg)"/><rect x="6.5" y="8.5" width="8.5" height="15" rx="1.8" fill="#fff"/><rect x="17.5" y="8.5" width="8.5" height="15" rx="1.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-dasharray="3.2 2.2"/><path d="M15 16h2.5" stroke="#141a20" stroke-width="2" stroke-linecap="round"/><circle cx="21.75" cy="16" r="1.6" fill="#141a20"/></svg><div class="eb">${eyebrow}</div><h1>${h}</h1><p>${p}</p>`;
}, [eyebrow, h, p]);
// Fullscreen (present mode) puts the app into the top layer above our popovers: re-show them to move them back on top.
const raise = () => page.evaluate(() => { if (!document.fullscreenElement) return; for (const id of ['vt-cap', 'vt-ring', 'vt-cur']) { const el = document.getElementById(id); if (!el || !el.showPopover) continue; try { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch { /* ignore */ } } });
const titleOff = () => page.evaluate(() => { const t = document.getElementById('vt-title'); if (t) t.className = 'off'; });
// Badge label: "Step N · …" captions set STEP N (prefix stripped), an explicit label sets it too, everything else keeps the current one.
let currentLabel = 'INTRO';
const CHAPTER = tour.meta.chapters;
const chapters = [{ title: CHAPTER.INTRO || 'Introduction', at: 0 }];
const chapterMark = (label) => { const t = CHAPTER[label] || label; if (chapters[chapters.length - 1].title !== t) chapters.push({ title: t, at: Date.now() - t0 }); };
const say = async (text, ms = 3200, n, during) => { await overlay(); await raise(); const m = text.match(/^Step (\d) · /); if (m) { currentLabel = `STEP ${m[1]}`; text = text.slice(m[0].length); text = text.charAt(0).toUpperCase() + text.slice(1); } else if (n) currentLabel = n; const label = currentLabel; chapterMark(label); await page.evaluate(([t, l]) => { const c = document.getElementById('vt-cap'); c.querySelector('.t').textContent = t; c.querySelector('.n').textContent = l; c.querySelector('.n').style.display = l ? '' : 'none'; c.classList.add('on'); }, [text, label]); const hold = speak(ms); if (!during) { await sleep(hold); return; } const t = Date.now(); await during(); await sleep(Math.max(300, hold - (Date.now() - t))); };
const hush = () => page.evaluate(() => document.getElementById('vt-cap')?.classList.remove('on'));
const moveTo = async (selector, opts = {}) => {
  await overlay(); await raise();
  const loc = page.locator(selector).first(); await loc.waitFor({ state: 'visible', timeout: 15000 }); await loc.scrollIntoViewIfNeeded(); await sleep(150);
  const b = await loc.boundingBox(); if (!b) return null; const x = b.x + Math.min(b.width - 6, opts.dx ?? b.width / 2), y = b.y + (opts.dy ?? b.height / 2);
  await page.evaluate(([x, y]) => { const c = document.getElementById('vt-cur'); c.style.left = x + 'px'; c.style.top = y + 'px'; }, [x, y]);
  await page.mouse.move(x, y, { steps: 12 }); await sleep(opts.pause ?? 600); return { x, y };
};
const click = async (selector, opts = {}) => {
  const p = await moveTo(selector, opts); if (!p) throw new Error('not found: ' + selector);
  await page.evaluate(([x, y]) => { const c = document.getElementById('vt-cur'); c.classList.remove('click'); void c.offsetWidth; c.classList.add('click'); const r = document.getElementById('vt-ring'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.classList.remove('on'); void r.offsetWidth; r.classList.add('on'); }, [p.x, p.y]);
  await page.locator(selector).first().click({ force: opts.force }); await sleep(opts.after ?? 500);
};
const type = async (selector, text) => { await click(selector, { after: 150 }); await page.locator(selector).first().fill(''); await page.locator(selector).first().pressSequentially(text, { delay: 45 }); await sleep(250); };

// ---------- the tour (scripts/tours/<TOUR>.mjs) ----------
await tour.run({ page, sleep, overlay, title, titleOff, say, hush, moveTo, click, type, speak, chapterMark, out, sgFiles, resolve });
await ctx.close(); await browser.close();
const webm = readdirSync(out).find(f => f.endsWith('.webm'));
renameSync(resolve(out, webm), resolve(out, 'walkthrough.webm'));
let mp4 = null;
const video = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30'];
// Chapters (FFMETADATA) + title, so players show "1 · Plan & prepare" etc. in the timeline.
const endMs = Date.now() - t0;
const esc = (x) => String(x).replace(/([=;#\\\n])/g, '\\$1');
writeFileSync(resolve(out, 'chapters.txt'), `;FFMETADATA1\ntitle=${esc(tour.meta.title)}\ncomment=${esc(tour.meta.comment)}\n` + chapters.map((c, i) => `\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${c.at}\nEND=${(chapters[i + 1]?.at ?? endMs) - 1}\ntitle=${esc(c.title)}\n`).join(''));
const meta = ['-f', 'ffmetadata', '-i', resolve(out, 'chapters.txt')];
// Subtitles from what is actually spoken (narration) – SRT for LMS / SharePoint, VTT for the web.
if (cues.length) { const subs = buildSubtitles(cues, NARR.clips, spokenText(tour.meta.narration)); writeFileSync(resolve(out, 'walkthrough.srt'), subs.srt); writeFileSync(resolve(out, 'walkthrough.vtt'), subs.vtt); }
try {
  if (cues.length) {
    // One input per clip, delayed to its caption, mixed without level ducking, then loudness-normalised (-16 LUFS).
    const inputs = cues.flatMap(c => ['-i', c.file]);
    const chains = cues.map((c, i) => `[${i + 1}:a]adelay=${Math.max(0, c.at)}:all=1[a${i}]`).join(';');
    const mix = `${chains};${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', resolve(out, 'walkthrough.webm'), ...inputs, ...meta, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-map_metadata', String(cues.length + 1), '-map_chapters', String(cues.length + 1), ...video, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', resolve(out, 'walkthrough.mp4')]);
    writeFileSync(resolve(out, 'cues.json'), JSON.stringify(cues, null, 1));
    if (cueNo !== NARR.order.length) console.warn(`narration: ${NARR.order.length} clips, ${cueNo} used – check that narration.json matches the tour`);
  } else {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', resolve(out, 'walkthrough.webm'), ...meta, '-map', '0:v', '-map_metadata', '1', '-map_chapters', '1', ...video, '-movflags', '+faststart', resolve(out, 'walkthrough.mp4')]);
  }
  mp4 = resolve(out, 'walkthrough.mp4');
} catch (e) { console.warn('ffmpeg not available or failed:', e.message); }
// Thumbnail / poster frame, rendered in a separate (not recorded) browser so it never flashes in the video.
try {
  const shot = existsSync(resolve(out, '_present.png')) ? 'data:image/png;base64,' + readFileSync(resolve(out, '_present.png')).toString('base64') : '';
  const b2 = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p2 = await b2.newPage({ viewport: { width: 1920, height: 1080 } });
  await p2.setContent(`<!doctype html><html><head><style>
    body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; font-family: 'Instrument Sans Variable', 'Segoe UI', system-ui, sans-serif; color: #fff; background: linear-gradient(118deg, #1f4e79 0%, #163a5b 55%, #10161c 100%); position: relative; }
    .l { position: absolute; left: 110px; top: 0; bottom: 0; width: 760px; display: flex; flex-direction: column; justify-content: center; }
    .eb { font-size: 22px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; opacity: .75; margin: 34px 0 18px; }
    h1 { font: 500 86px/1.05 Georgia, 'Source Serif 4', serif; margin: 0 0 26px; letter-spacing: -.01em; }
    p { font-size: 32px; line-height: 1.35; opacity: .85; margin: 0; }
    .pill { display: inline-flex; gap: 14px; align-items: center; margin-top: 44px; font-size: 26px; font-weight: 600; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.25); padding: 14px 26px 14px 16px; border-radius: 999px; width: fit-content; }
    .pill i { width: 46px; height: 46px; border-radius: 50%; background: #fff; display: grid; place-items: center; } .pill i:after { content: ''; border-left: 16px solid #1f4e79; border-top: 10px solid transparent; border-bottom: 10px solid transparent; margin-left: 5px; }
    .shot { position: absolute; right: -60px; top: 150px; width: 1040px; border-radius: 18px; box-shadow: 0 40px 90px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.18); transform: perspective(1800px) rotateY(-8deg); }
  </style></head><body><div class="l">
    <svg width="96" height="96" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9dbbd6"/><stop offset="1" stop-color="#2f7a7a"/></linearGradient></defs><rect width="32" height="32" rx="7" fill="url(#g)"/><rect x="6.5" y="8.5" width="8.5" height="15" rx="1.8" fill="#fff"/><rect x="17.5" y="8.5" width="8.5" height="15" rx="1.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-dasharray="3.2 2.2"/><path d="M15 16h2.5" stroke="#141a20" stroke-width="2" stroke-linecap="round"/><circle cx="21.75" cy="16" r="1.6" fill="#141a20"/></svg>
    <div class="eb">GBS Fit-Gap Workbench</div><h1>${tour.meta.thumb.h1}</h1><p>${tour.meta.thumb.p}</p>
    <div class="pill"><i></i>${tour.meta.thumb.pill(endMs)}</div></div>${shot ? `<img class="shot" src="${shot}">` : ''}</body></html>`);
  await p2.waitForTimeout(300); await p2.screenshot({ path: resolve(out, 'thumbnail.png') }); await b2.close();
} catch (e) { console.warn('thumbnail failed:', e.message); }
console.log('chapters:', chapters.map(c => `${(c.at / 1000).toFixed(0)}s ${c.title}`).join(' | '));
console.log('video:', resolve(out, 'walkthrough.webm'), mp4 ? '+ ' + mp4 : '', '· page errors:', errors.length, errors.slice(0, 2));
