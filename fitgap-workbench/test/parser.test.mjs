import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
globalThis.XLSX = XLSX;
const here = path.dirname(fileURLToPath(import.meta.url));
for (const m of ['00-util.js', '10-profile.js', '15-demo.js', '20-parser.js', '30-model.js']) require(path.join(here, '..', 'src', 'js', m));
const FG = globalThis.FG;

const demoDir = path.join(here, '..', 'samples', 'demo');
if (!fs.existsSync(path.join(demoDir, 'Demo_FitGap_R2R.xlsx'))) {
  fs.mkdirSync(demoDir, { recursive: true });
  for (const f of FG.demo.buildWorkbooks(XLSX)) XLSX.writeFile(f.wb, path.join(demoDir, f.name));
}
const parse = (name, sheetName) => FG.parser.parseWorkbook(XLSX.readFile(path.join(demoDir, name)), { fileName: name, sheetName });

test('value normalisation maps typos and pre-set values', () => {
  const rep = { gap: {}, yn: {}, num: {} }, P = FG.defaultProfile;
  assert.equal(FG.parser.normGap('HARMINIZATION', P, rep), 'HARMONIZATION');
  assert.equal(FG.parser.normGap('Harmonisation Gap', P, rep), 'HARMONIZATION');
  assert.equal(FG.parser.normGap('BOTH GAPs', P, rep), 'BOTH');
  assert.equal(FG.parser.normGap('standardization', P, rep), 'STANDARDIZATION');
  assert.equal(FG.parser.normGap('No Gap', P, rep), 'NO_GAP');
  assert.equal(FG.parser.normGap('?', P, rep), 'UNCLEAR');
  assert.equal(FG.parser.normGap('n/a', P, rep), 'NA');
  assert.equal(FG.parser.normGap('Out of scope', P, rep), 'OUT_OF_SCOPE');
  assert.equal(FG.parser.normGap(' ', P, rep), null);
  assert.equal(FG.parser.normGap('Gap tbd by Ops', P, rep), 'UNCLEAR');
  assert.deepEqual(rep.gap, { 'Gap tbd by Ops': 1 });
  assert.equal(FG.parser.normYN('x', P, rep), 'Y');
  assert.equal(FG.parser.normYN('No', P, rep), 'N');
  assert.equal(FG.parser.normYN('', P, rep), null);
});

test('entity labels: code + name, suffix in parentheses stripped', () => {
  const e = FG.parser.parseEntityLabel('201023 Fresenius Vial S.A.S. (Legal entity)', FG.defaultProfile);
  assert.deepEqual([e.code, e.name, e.needsConfirmation], ['201023', 'Fresenius Vial S.A.S.', false]);
  const f = FG.parser.parseEntityLabel('Demo Co (branch)', FG.defaultProfile);
  assert.deepEqual([f.code, f.name, f.needsConfirmation], [null, 'Demo Co', true]);
});

test('R2R: header row 6, no AS-IS title – as-is block inferred from "Activity Split As-is"', () => {
  const r = parse('Demo_FitGap_R2R.xlsx');
  assert.ok(r.ok, r.error);
  assert.equal(r.structure.headerRow, 6);
  assert.equal(r.structure.idCols.level, 'B');
  assert.equal(r.entities.length, 3);
  const asIs = r.structure.blocks.filter(b => b.key === 'asIs');
  assert.equal(asIs.length, 3);
  for (const b of asIs) for (const f of ['le', 'gbs', 'systems', 'gap', 'info']) assert.ok(b.fields[f], 'asIs field ' + f);
  assert.equal(r.stats.activities, 120);
  assert.equal(r.stats.assessments, 120 * 3);
  assert.equal(r.structure.blocks.filter(b => b.key === 'detailedGap').length, 3);
  assert.ok(r.processes.find(p => p.id === 'R2R 2.1').isMasterData, 'master data flag');
  assert.equal(r.processes.find(p => p.id === 'R2R 1.1.1.1').parentId, 'R2R 1.1.1');
});

test('A2R: header row 8, "ASSSSMENT" typo, old sheet ignored, Out of scope, FAA/IA sub-streams', () => {
  const r = parse('Demo_FitGap_A2R.xlsx');
  assert.ok(r.ok, r.error);
  assert.equal(r.structure.headerRow, 8);
  assert.ok(r.structure.sheets.ignored.some(s => s.name === 'Fit-Gap Template_A2R_vold'));
  assert.equal(r.structure.blocks.filter(b => b.key === 'fitGap').length, 3);
  assert.deepEqual(r.entities.map(e => e.code), ['300102', '300103', '300101']);
  assert.ok(r.stats.outOfScope > 100);
  const oos = r.assessments.find(a => a.status === 'OUT_OF_SCOPE');
  assert.ok(oos && oos.statusReason);
  const subs = new Set(r.processes.filter(p => p.isActivity).map(p => p.subStream));
  assert.deepEqual([...subs].sort(), ['A2R-FAA', 'A2R-IA']);
});

test('I2P: header row 9, instruction text becomes notes, unmapped GAP values reported', () => {
  const r = parse('Demo_FitGap_I2P.xlsx');
  assert.ok(r.ok, r.error);
  assert.equal(r.structure.headerRow, 9);
  assert.equal(r.stats.activities, 431);
  assert.equal(r.notes.length, 3);
  assert.match(r.notes[0].text, /to be copied/);
  assert.ok(r.unmapped.gap['Gap tbd by Ops'] > 0);
  assert.ok(r.warnings.some(w => w.code === 'GAP_UNMAPPED'));
  assert.ok(r.warnings.some(w => w.code === 'INSTRUCTION_TEXT'));
});

test('I2C: lower-case "Fit-gap" sheet, entity suffix stripped', () => {
  const r = parse('Demo_FitGap_I2C.xlsx');
  assert.ok(r.ok, r.error);
  assert.equal(r.sheetName, 'Fit-gap Template_I2C');
  assert.deepEqual(r.entities.map(e => e.name), ['Demo France SAS', 'Demo Pharma France SAS', 'Demo Services SARL']);
});

test('ICO: un-merged titles and entity labels, trailing space in sheet name, stray header rows skipped', () => {
  const r = parse('Demo_FitGap_ICO.xlsx');
  assert.ok(r.ok, r.error);
  assert.equal(r.sheetName, 'Fit-Gap Template_ICO ');
  for (const k of ['asIs', 'fitGap', 'detailedGap']) assert.equal(r.structure.blocks.filter(b => b.key === k).length, 3, k);
  assert.ok(r.warnings.some(w => w.code === 'ROWS_SKIPPED' && /2 row/.test(w.msg)));
  assert.equal(r.stats.activities, 337);
});

test('several candidate sheets → needsPick', () => {
  const wb = XLSX.readFile(path.join(demoDir, 'Demo_FitGap_I2C.xlsx'));
  const ws2 = wb.Sheets['Fit-gap Template_I2C'];
  XLSX.utils.book_append_sheet(wb, ws2, 'Fit-Gap Template_I2C copy');
  const r = FG.parser.parseWorkbook(wb, { fileName: 'x.xlsx' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.needsPick, ['Fit-gap Template_I2C', 'Fit-Gap Template_I2C copy']);
  const r2 = FG.parser.parseWorkbook(wb, { fileName: 'x.xlsx', sheetName: r.needsPick[1] });
  assert.ok(r2.ok);
});

test('model: I2C + I2C_CMD merge to one assessment per entity × Process ID with two sources', () => {
  const s = FG.model.createSession();
  const a = FG.model.mergeImport(s, parse('Demo_FitGap_I2C.xlsx'));
  const b = FG.model.mergeImport(s, parse('Demo_FitGap_I2C_CMD.xlsx'));
  assert.equal(a.added.assessments, 325 * 3);
  assert.equal(b.added.assessments, 0);
  assert.equal(b.diffs.length, 0, 'same Ops values in both files → no diffs');
  assert.equal(Object.keys(s.entities).length, 3);
  const act = s.processes['I2C 1.1.1.1'];
  assert.deepEqual(act.sources, ['Demo_FitGap_I2C.xlsx', 'Demo_FitGap_I2C_CMD.xlsx']);
  assert.equal(s.assessments['300101|I2C 1.1.1.1'].sources.length, 2);
  assert.equal(s.files.length, 2);
  const m = FG.model.entityStreamMatrix(s);
  assert.equal(m.cells['300101']['I2C'], 325);
});

test('model: re-import keeps workshop results and queues Ops diffs for review', () => {
  const s = FG.model.createSession();
  FG.model.mergeImport(s, parse('Demo_FitGap_R2R.xlsx'));
  const k = '300101|R2R 1.1.1.1';
  s.assessments[k].workshop.status = 'GAP';
  s.assessments[k].workshop.comment = 'kept';
  const p2 = parse('Demo_FitGap_R2R.xlsx');
  const row = p2.assessments.find(a => a.entityKey === '300101' && a.processId === 'R2R 1.1.1.1');
  const before = row.asIs.gap;
  row.asIs.gap = before === 'BOTH' ? 'NO_GAP' : 'BOTH';
  const sum = FG.model.mergeImport(s, p2);
  assert.ok(sum.isReimport);
  assert.equal(sum.diffs.length, 1);
  assert.equal(s.pendingDiffs.length, 1);
  assert.equal(s.assessments[k].asIs.gap, before, 'not overwritten');
  assert.equal(s.assessments[k].workshop.status, 'GAP');
  assert.equal(s.files.length, 1);
  assert.equal(s.files[0].version, 2);
  FG.model.resolveDiff(s, s.pendingDiffs[0].id, true);
  assert.equal(s.assessments[k].asIs.gap, row.asIs.gap);
  assert.equal(s.pendingDiffs.length, 0);
  assert.ok(s.audit.some(x => x.kind === 'reimport-apply'));
});

test('model: stream summary and totals exclude out-of-scope', () => {
  const s = FG.model.createSession();
  for (const f of ['Demo_FitGap_R2R.xlsx', 'Demo_FitGap_A2R.xlsx']) FG.model.mergeImport(s, parse(f));
  const st = FG.model.streamSummary(s);
  assert.deepEqual(st.map(x => x.key), ['R2R', 'A2R-FAA', 'A2R-IA']);
  const t = FG.model.totals(s);
  assert.equal(t.activities, 120 + 261);
  assert.ok(t.outOfScope > 0);
  assert.equal(t.assessments + t.outOfScope, (120 + 261) * 3);
  const json = JSON.stringify(s);
  assert.equal(FG.model.validateSession(JSON.parse(json)), null);
});
