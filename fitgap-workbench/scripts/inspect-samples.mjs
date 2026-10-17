#!/usr/bin/env node
// Step-1 structure printout: for every capture workbook in a folder, print the
// selected sheet, header row, core columns, detected blocks with entity and
// field → column mapping, data-row counts, gap distribution and warnings.
// Usage: node scripts/inspect-samples.mjs [folder=samples] [--json out.json]
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseCaptureWorkbook, colLetter } from '../src/parser/capture.js';
import { createSession, mergeParsedWorkbook, importSummary } from '../src/model/session.js';
import { GAP_LABEL } from '../src/model/constants.js';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const folder = resolve(args.find(a => !a.startsWith('--') && a !== jsonOut) || 'samples');
const files = readdirSync(folder).filter(f => /\.xlsx?$/i.test(f) && !f.startsWith('~$')).sort();
if (!files.length) { console.error(`No .xlsx files in ${folder}`); process.exit(1); }

const session = createSession();
const out = [];
for (const f of files) {
  const path = join(folder, f);
  const buf = readFileSync(path);
  const wb = XLSX.read(buf, { type: 'buffer', cellStyles: false });
  console.log(`\n${'='.repeat(100)}\n${f}  (${(statSync(path).size / 1024).toFixed(0)} KB)`);
  const parsed = parseCaptureWorkbook(wb, { XLSX, fileName: f });
  console.log(`  sheets: main=${parsed.sheetName || '-'} | candidates=${parsed.sheets.candidates.join(', ') || '-'} | old=${parsed.sheets.excludedOld.join(', ') || '-'} | flows=${parsed.sheets.flows.join(', ') || '-'} | ignored=${parsed.sheets.ignored.join(', ') || '-'}`);
  if (!parsed.ok) { console.log('  NOT PARSED:'); for (const w of parsed.warnings) console.log(`   [${w.level}] ${w.message}`); out.push(parsed); continue; }
  const L = parsed.layout;
  console.log(`  header row: ${L.headerRow + 1} | core columns: ${Object.entries(L.core).map(([k, v]) => `${k}=${colLetter(v.col)} "${v.header}"`).join(', ')}`);
  console.log(`  band rows ${L.band.top + 1}–${L.headerRow}: ${L.band.titles.length} block titles, ${L.band.subHeaders.length} sub-headers, ${L.band.labels.length} entity labels`);
  console.log('  blocks:');
  for (const b of L.blocks) {
    const ent = b.entity ? `${b.entity.code || '(no code)'} ${b.entity.name}${b.entityGuessed ? ' [GUESSED]' : ''}` : '(shared)';
    console.log(`   ${b.kind.padEnd(10)} ${colLetter(b.col)}–${colLetter(b.colEnd)}  ${ent}`);
    const fields = Object.entries(b.headers).map(([f, h]) => `${f}=${h.cell}${h.score < 1 ? `~${h.score}` : ''}`).join(', ');
    if (fields) console.log(`              fields: ${fields}`);
    if (b.missing.length) console.log(`              missing: ${b.missing.join(', ')}`);
    if (b.extras.length) console.log(`              extra columns: ${b.extras.map(x => `${colLetter(x.col)} "${x.header}"`).join(', ')}`);
  }
  const levels = {};
  for (const p of parsed.processes) levels[p.level] = (levels[p.level] || 0) + 1;
  console.log(`  rows: ${parsed.processes.length} process rows (${Object.entries(levels).map(([l, n]) => `L${l}: ${n}`).join(', ')}), ${parsed.summary.activities} activities, ${parsed.assessments.length} entity×activity assessments`);
  for (const [code, s] of Object.entries(parsed.summary.perEntity)) {
    const e = parsed.entities.find(x => x.code === code);
    const gaps = Object.entries(s.gap).map(([g, n]) => `${GAP_LABEL[g] || g}: ${n}`).join(', ');
    console.log(`   ${e ? e.name : code}: ${s.total} activities, ${s.outOfScope} out of scope | Ops GAP → ${gaps}`);
  }
  for (const w of parsed.warnings) {
    console.log(`   [${w.level}] ${w.message}`);
    for (const ex of (w.examples || []).slice(0, 5)) console.log(`        ${JSON.stringify(ex)}`);
  }
  // Drawings in flow sheets (image count only – extraction comes with increment 5).
  try {
    const zip = await JSZip.loadAsync(buf);
    const media = Object.keys(zip.files).filter(n => n.startsWith('xl/media/'));
    const drawings = Object.keys(zip.files).filter(n => /^xl\/drawings\/drawing\d+\.xml$/.test(n));
    console.log(`  package: ${media.length} media file(s), ${drawings.length} drawing part(s)`);
  } catch (e) { console.log(`  package: could not open as zip (${e.message})`); }
  const report = mergeParsedWorkbook(session, parsed);
  console.log(`  merge: entities +${report.entities.added.length} / merged ${report.entities.merged.length} / pending ${report.entities.pending.length}; processes +${report.processes.added} (${report.processes.existing} existing); assessments +${report.assessments.added} (${report.assessments.merged} merged, ${report.assessments.changedOps} Ops values changed)`);
  out.push({ fileName: f, sheetName: parsed.sheetName, layout: { headerRow: L.headerRow + 1, core: L.core, blocks: L.blocks.map(b => ({ kind: b.kind, cols: `${colLetter(b.col)}–${colLetter(b.colEnd)}`, entity: b.entity, headers: b.headers, missing: b.missing, extras: b.extras })) }, summary: parsed.summary, warnings: parsed.warnings });
}
const s = importSummary(session);
console.log(`\n${'='.repeat(100)}\nSESSION AFTER MERGE: ${s.entities.length} entities, ${s.streams.length} streams, ${Object.keys(session.processes).length} processes, ${s.assessments} assessments, ${s.outOfScope} out of scope`);
console.log('  entities × streams:');
for (const e of s.entities) console.log(`   ${(e.code + ' ' + e.name).padEnd(40)} ${s.streams.map(st => `${st}: ${(s.matrix[e.code] || {})[st] || 0}`).join('  ')}`);
console.log('  Ops gap distribution per stream:');
for (const st of s.streams) console.log(`   ${st.padEnd(5)} ${Object.entries(s.gapByStream[st]).map(([g, n]) => `${GAP_LABEL[g] || g}: ${n}`).join(', ')}`);
if (s.pendingEntityMatches.length) console.log(`  pending entity confirmations: ${s.pendingEntityMatches.map(p => `${p.imported.name} ≈ ${session.entities[p.candidate].name} (${p.score.toFixed(2)})`).join('; ')}`);
if (s.importDiffs.length) console.log(`  Ops values changed by re-import: ${s.importDiffs.length}`);
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ files: out, summary: s }, null, 2)); console.log(`\nwrote ${jsonOut}`); }
