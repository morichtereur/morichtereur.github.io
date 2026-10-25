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

const out = resolve(process.argv[2] || 'dist/video'); mkdirSync(out, { recursive: true });
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
const CHAPTER = { INTRO: 'Introduction', OVERVIEW: 'Start here', 'STEP 1': '1 · Plan & prepare', 'STEP 2': '2 · Workshop', 'STEP 3': '3 · Present', 'STEP 4': '4 · Results', 'STEP 5': '5 · QG2 sign-off & hand-over' };
const chapters = [{ title: 'Introduction', at: 0 }];
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

// ---------- the tour ----------
await page.goto('file://' + resolve('dist/index.html')); await page.waitForSelector('dialog[open]');
await overlay();
// The modal dialog sits in the browser's top layer, above any overlay – hide it while the title card plays.
await page.evaluate(() => { document.querySelector('dialog[open]').style.visibility = 'hidden'; });
await title('GBS Fit-Gap Workbench', 'Plan, run and sign off a country fit-gap.', 'One offline file. Capture sheets in, workshop decisions out – with an audit trail, present mode and the hand-over package.');
await sleep(speak(4200)); await titleOff(); await sleep(700);
await page.evaluate(() => { document.querySelector('dialog[open]').style.visibility = ''; }); await sleep(600);

await say('It opens from a single HTML file – no install, no server, no network. Everything is saved in the browser.', 3600, '');
await click('dialog button:has-text("Try with demo data")', { after: 900 });
await page.waitForSelector('.wtable tr.act', { timeout: 60000 });
await say('Demo data: a fictional group with three entities and all five streams, exactly like a real capture workbook set.', 3400, '');
await hush();

// Start here
await click('.side-nav > .side-nav-item:has-text("Start here")'); await page.waitForSelector('.hero');
await say('Start here shows the five steps and where you are. The client logo and name come straight from the workbooks.', 4000, 'OVERVIEW');
await moveTo('.hero-stats', { pause: 1200 });
await say('Entities, streams, activities, progress and deviations – live, from the session.', 2800, '');
await hush();

// Plan
await click('.side-nav > .side-nav-item:has-text("Plan")'); await page.waitForSelector('.brand-settings');
await say('Step 1 · Plan & prepare: client, country, your initials for the audit trail, logo and brand colour.', 3600);
await moveTo('.brand-settings', { pause: 900 });
await page.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' })); await sleep(900);
await say('People in the room and one session per stream. The traffic light tells you what is still missing before the workshop.', 3800, '');
await hush();

// Workshop
await click('.side-nav > .side-nav-item:has-text("Workshop")');
{ const back = page.locator('button:has-text("Back to the workshop")'); if (await back.count()) await back.first().click(); }
await page.waitForSelector('.wtable tr.act');
await say('Step 2 · Workshop: the process tree on the left, one row per activity, the entities side by side.', 3800);
await moveTo('.tree-node.sel', { pause: 900 });
await moveTo('.wtable thead th >> nth=1', { pause: 900 });
await say('Every cell shows the Ops pre-assessment. Accept all "no gap" rows in one click – and discuss only the flagged ones.', 3800, '');
await click('.l3head .btn-primary', { after: 1200 });
await say('Fit, Gap or ? per entity. Ops was unsure here – it becomes an open question with one click.', 3400, '');
await click('.wtable tr.act >> nth=1 >> .qbtn.q >> nth=0', { after: 900 });
await click('.wtable tr.act td.ent .pill >> nth=0', { after: 900 });
await page.waitForSelector('.expand-inner');
await say('Open a cell for the full form: activity split, FTE, the detailed gap fields, gap type, rationale and the deviation block.', 4000, '');
await moveTo('.expand-inner .yn >> nth=0', { pause: 500 });
await click('.expand-inner .yn >> nth=0 >> button >> nth=0', { after: 700 });
await say('Every change is logged with session, editor and timestamp – the audit trail is built in.', 3000, '');
await hush();
await page.keyboard.press('Escape'); await sleep(400);

// Flow board
await click('.yn button:has-text("Flow board")'); await page.waitForSelector('.board-grid .stepcard');
await say('The same process group as a flow board: lanes for Local, Other party and GBS, one card per step, hand-offs between lanes.', 4000);
await click('.board-grid .stepcard >> nth=1', { after: 900 });
await say('Click a step to capture who performs it and what is different from the global standard.', 3200, '');
await click('.board-detail .gapbtns .pill-HARMONIZATION', { after: 900 });
await type('.board-detail textarea', 'Approval done locally in Excel, not in the workflow tool');
await hush();
await click('.yn button:has-text("Table")', { after: 400 });

// Present mode
await click('.l3head button:has-text("Present")'); await page.waitForSelector('.present .board-grid');
await page.keyboard.press('Home'); await sleep(900);
await say('Step 3 · Present: full-screen slides for the room. Cover with the client logo, scope, gap types, then one process group after another.', 4200);
await page.keyboard.press('ArrowRight'); await sleep(1600);
await page.keyboard.press('ArrowRight'); await sleep(1600);
await page.keyboard.press('ArrowRight'); await sleep(1200);
await say('Flow boards in present mode are editable: who performs a step, its FTE and what is different are captured live.', 3600, '', async () => {
  await click('.present .board-grid .stepcard >> nth=2', { after: 900 });
  await click('.present .board-detail .yn >> nth=0 >> button >> nth=0', { after: 700 });
  await click('.present .board-detail .fte-row .chip:has-text("0.25")', { after: 900 });
  await click('.present .board-detail .gapbtns .pill-STANDARDIZATION', { after: 700 });
});
// Poster inset for the thumbnail: the flow board with a step being edited, without caption and cursor.
await page.screenshot({ path: resolve(out, '_present.png'), style: '#vt-cap, #vt-cur, #vt-ring { visibility: hidden !important; }' });
await page.keyboard.press('ArrowRight'); await sleep(1400);
await say('The table slide shows the entities side by side, with the findings per cell.', 2800, '');
await page.keyboard.press('End'); await sleep(1800);
await say('The closing slide: what was assessed, open points, next session.', 2800, '');
await hush(); await page.keyboard.press('Escape'); await page.waitForSelector('.present', { state: 'detached' }); await sleep(400);

// Results
await click('.side-nav > .side-nav-item:has-text("Results")'); await page.waitForSelector('.board-cols');
await say('Step 4 · Results: every deviation on one board. Resolution approach, accountable owner, escalation level, approval status.', 4000);
await moveTo('.dev-card >> nth=0', { pause: 800 });
await click('.dev-card .btn-primary >> nth=0', { after: 900 });
await page.evaluate(() => window.scrollBy({ top: 700, behavior: 'smooth' })); await sleep(1000);
await say('Below: activity split versus plan, Ops versus workshop, the change matrix and the cross-entity view.', 3600, '');
await hush();

// QG2 + hand-over
await click('.side-nav > .side-nav-item:has-text("Sign-off")'); await page.waitForSelector('text=Sign-off per stream');
await say('Step 5 · QG2 sign-off: readiness per entity and stream, and the sign-off fields for Process Expert and GBS Operations.', 3800);
await click('.side-nav > .side-nav-item:has-text("Hand-over")'); await page.waitForSelector('text=Package contents');
await say('The hand-over package: deviation log, separate variants for the DTPs, initiative candidates, taxonomy change requests, QG2 summary, flat export, audit trail.', 4200, '');
await moveTo('button:has-text("Download hand-over package")', { pause: 900 });
await say('And the write-back: the workshop results go into the original capture workbooks – values only, formatting kept.', 3600, '');
await hush();

chapterMark('Summary');
await title('GBS Fit-Gap Workbench', 'Capture sheets in. Decisions out.', 'Plan · Workshop · Present · Results · QG2 · Hand-over. One file, offline, with the full audit trail.');
await sleep(speak(4000) + 600);
await ctx.close(); await browser.close();
const webm = readdirSync(out).find(f => f.endsWith('.webm'));
renameSync(resolve(out, webm), resolve(out, 'walkthrough.webm'));
let mp4 = null;
const video = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30'];
// Chapters (FFMETADATA) + title, so players show "1 · Plan & prepare" etc. in the timeline.
const endMs = Date.now() - t0;
const esc = (x) => String(x).replace(/([=;#\\\n])/g, '\\$1');
writeFileSync(resolve(out, 'chapters.txt'), ';FFMETADATA1\ntitle=GBS Fit-Gap Workbench – walkthrough\ncomment=Plan · Workshop · Present · Results · QG2 · Hand-over\n' + chapters.map((c, i) => `\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${c.at}\nEND=${(chapters[i + 1]?.at ?? endMs) - 1}\ntitle=${esc(c.title)}\n`).join(''));
const meta = ['-f', 'ffmetadata', '-i', resolve(out, 'chapters.txt')];
// Subtitles from what is actually spoken (narration) – SRT for LMS / SharePoint, VTT for the web.
if (cues.length) { const subs = buildSubtitles(cues, NARR.clips, spokenText()); writeFileSync(resolve(out, 'walkthrough.srt'), subs.srt); writeFileSync(resolve(out, 'walkthrough.vtt'), subs.vtt); }
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
  const mins = Math.max(1, Math.round(endMs / 60000));
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
    <div class="eb">GBS Fit-Gap Workbench</div><h1>From capture sheets to QG2 sign-off.</h1><p>Plan · Workshop · Present · Results · Hand-over – one offline file.</p>
    <div class="pill"><i></i>${mins}-minute walkthrough</div></div>${shot ? `<img class="shot" src="${shot}">` : ''}</body></html>`);
  await p2.waitForTimeout(300); await p2.screenshot({ path: resolve(out, 'thumbnail.png') }); await b2.close();
} catch (e) { console.warn('thumbnail failed:', e.message); }
console.log('chapters:', chapters.map(c => `${(c.at / 1000).toFixed(0)}s ${c.title}`).join(' | '));
console.log('video:', resolve(out, 'walkthrough.webm'), mp4 ? '+ ' + mp4 : '', '· page errors:', errors.length, errors.slice(0, 2));
