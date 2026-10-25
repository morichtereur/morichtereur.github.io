#!/usr/bin/env node
// Subtitles (SRT + VTT) from what is actually spoken: narration text, timed by the cue at which each clip starts.
// Lines ≤ 42 characters, ≤ 2 lines per event, a new event after every sentence end; time split by character count.
// Standalone: node scripts/subtitles.mjs <video-dir> <narration manifest.json>   (reads <video-dir>/cues.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX = 42;
// "G-B-S" / "Q-G-2" / "D-T-Ps" are spelled out for the voice; on screen they are plain abbreviations.
export const screenText = (t) => t.replace(/\b(?:[A-Z0-9]-){1,4}[A-Z0-9]s?\b/g, m => m.replace(/-/g, ''));

// Long sentences are split at a clause break (comma, dash, colon) nearest the middle, else at the middle word.
function splitClauses(s) {
  if (s.length <= 2 * MAX) return [s];
  const mid = s.length / 2; const near = (list) => list.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  const clauses = [...s.matchAll(/[,;:–]\s/g)].map(m => m.index + 1).filter(c => c > 12 && s.length - c > 12);
  const at = clauses.length ? near(clauses) : near([...s.matchAll(/\s/g)].map(m => m.index));
  return [...splitClauses(s.slice(0, at).trim()), ...splitClauses(s.slice(at).trim())];
}
// Two lines of similar length, each ≤ MAX where possible.
function balance(chunk) {
  if (chunk.length <= MAX) return chunk;
  const mid = chunk.length / 2; const spaces = [...chunk.matchAll(/ /g)].map(m => m.index);
  const fits = spaces.filter(i => i <= MAX && chunk.length - i - 1 <= MAX); const pool = fits.length ? fits : spaces;
  const i = pool.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  return `${chunk.slice(0, i)}\n${chunk.slice(i + 1)}`;
}
export function events(text) {
  const chunks = (text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || [text]).map(x => x.trim()).filter(Boolean).flatMap(splitClauses);
  // Very short sentences ("One click.") join the previous event when both still fit on two lines.
  const merged = []; for (const c of chunks) { const prev = merged[merged.length - 1]; if (prev && (c.length < 20 || prev.length < 20) && `${prev} ${c}`.length <= 2 * MAX) merged[merged.length - 1] = `${prev} ${c}`; else merged.push(c); }
  return merged.map(balance);
}

export function buildSubtitles(cues, clips, spoken) {
  const list = [];
  for (const c of cues) {
    const text = screenText(spoken[c.id] || ''); if (!text || !clips[c.id]) continue;
    const chunks = events(text); const dur = clips[c.id].duration * 1000; const total = chunks.reduce((a, x) => a + x.length, 0); let at = c.at;
    for (const ch of chunks) { const d = dur * ch.length / total; list.push({ start: Math.round(at), end: Math.round(at + d - 40), text: ch }); at += d; }
  }
  const t = (ms, sep) => { const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, f = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(f).padStart(3, '0')}`; };
  return {
    srt: list.map((e, i) => `${i + 1}\n${t(e.start, ',')} --> ${t(e.end, ',')}\n${e.text}\n`).join('\n'),
    vtt: 'WEBVTT\n\n' + list.map(e => `${t(e.start, '.')} --> ${t(e.end, '.')}\n${e.text}\n`).join('\n'),
    count: list.length,
  };
}

export function spokenText(spec = 'narration.json') {
  return Object.fromEntries(JSON.parse(readFileSync(new URL(`./${spec}`, import.meta.url), 'utf8')).lines.map(l => [l.id, l.text]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, manifest] = process.argv.slice(2);
  const cues = JSON.parse(readFileSync(resolve(dir, 'cues.json'), 'utf8')); const clips = JSON.parse(readFileSync(manifest, 'utf8')).clips;
  const subs = buildSubtitles(cues, clips, spokenText());
  writeFileSync(resolve(dir, 'walkthrough.srt'), subs.srt); writeFileSync(resolve(dir, 'walkthrough.vtt'), subs.vtt);
  console.log(`${subs.count} subtitle events → ${resolve(dir, 'walkthrough.srt')} (+ .vtt)`);
}
