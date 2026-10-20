#!/usr/bin/env node
// Prints the detected structure of one or more capture-sheet workbooks:
// header row, blocks, entities, column mapping, counts, warnings.
//   node scripts/inspect.mjs samples/*.xlsx
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
globalThis.XLSX = XLSX;
const here = path.dirname(fileURLToPath(import.meta.url));
for (const m of ['00-util.js', '10-profile.js', '20-parser.js']) require(path.join(here, '..', 'src', 'js', m));
const FG = globalThis.FG;
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/inspect.mjs <file.xlsx> …'); process.exit(1); }
for (const f of files) {
  const wb = XLSX.readFile(f, { cellStyles: false });
  let res = FG.parser.parseWorkbook(wb, { fileName: path.basename(f) });
  if (!res.ok && res.needsPick) { console.log(`\n## ${path.basename(f)}: several candidate sheets – ${res.needsPick.join(', ')}; using the first`); res = FG.parser.parseWorkbook(wb, { fileName: path.basename(f), sheetName: res.needsPick[0] }); }
  console.log(`\n## ${res.fileName}`);
  if (!res.ok) { console.log('   ERROR:', res.error); continue; }
  const s = res.structure;
  console.log(`   sheet "${res.sheetName}"  header row ${s.headerRow}  id cols: level ${s.idCols.level} · id ${s.idCols.id} · name ${s.idCols.name} · description ${s.idCols.description}`);
  console.log(`   sheets: flows ${s.sheets.flows.join(', ') || '–'} | ignored ${s.sheets.ignored.map(x => x.name + ' (' + x.reason + ')').join(', ')}`);
  console.log(`   entities: ${s.entities.map(e => (e.code || '?') + ' ' + e.name + (e.needsConfirmation ? ' [confirm]' : '')).join(' | ')}`);
  for (const b of s.blocks) {
    const fields = Object.entries(b.fields).map(([k, v]) => `${k}=${v.letter}`).join(' ');
    console.log(`   block ${b.key.padEnd(12)} ${b.colStartLetter}–${b.colEndLetter}  ${b.entity ? '[' + b.entity.code + '] ' : ''}${fields}${b.unmapped.length ? '  unmapped: ' + b.unmapped.map(u => FG.util.colLetter(u.col) + ' "' + u.header + '"').join(', ') : ''}`);
  }
  const st = res.stats;
  console.log(`   rows: nodes ${st.nodes} · activities ${st.activities} · by level ${JSON.stringify(st.byLevel)} · assessments ${st.assessments} · out of scope ${st.outOfScope} · streams ${st.streams.join(',')}`);
  console.log(`   Ops GAP distribution: ${Object.entries(st.gapDist).map(([k, n]) => k + ' ' + n).join(' · ')}`);
  console.log(`   notes (instruction text): ${res.notes.length}`);
  for (const w of res.warnings) console.log(`   ${w.level.toUpperCase().padEnd(5)} ${w.code}: ${w.msg}`);
}
