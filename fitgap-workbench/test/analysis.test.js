import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { parseCaptureWorkbook } from '../src/parser/capture.js';
import { createSession, mergeParsedWorkbook } from '../src/model/session.js';
import { applyChange, bulkConfirmNoGap, confirmFit } from '../src/model/workshop.js';
import { classifySplit, activitySplit, gapAnalysis, qg2Readiness, prepareReadiness } from '../src/model/analysis.js';
import { patchSheetXml, writeBackCells, writeBackWorkbook } from '../src/model/writeback.js';

let s, dir;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'fitgap-an-')); execFileSync(process.execPath, ['scripts/generate-demo.mjs', dir], { stdio: 'ignore' });
  s = createSession();
  for (const f of readdirSync(dir)) mergeParsedWorkbook(s, parseCaptureWorkbook(XLSX.read(readFileSync(join(dir, f)), { type: 'buffer' }), { XLSX, fileName: f }));
  s.participants.push({ id: 'p1', name: 'A', role: '', organisation: 'Local' });
  bulkConfirmNoGap(s, Object.values(s.assessments).filter(a => a.stream === 'R2R').map(a => a.key), s.processes);
  const a = Object.values(s.assessments).find(x => x.stream === 'R2R' && x.asIs.gap === 'HARMONIZATION' && !x.scope.outOfScope && s.processes[x.processId].toBe.gbs === true);
  applyChange(s, a.key, 'fitGap.local', true); applyChange(s, a.key, 'fitGap.other', false); applyChange(s, a.key, 'fitGap.gbs', false); applyChange(s, a.key, 'fitGap.fte', 0.5);
  applyChange(s, a.key, 'workshop.gapType', 'HARMONIZATION'); applyChange(s, a.key, 'workshop.rationale', 'x'); applyChange(s, a.key, 'detailedGap.legalRegulatory', 'FEC & <audit>'); applyChange(s, a.key, 'workshop.status', 'GAP_CONFIRMED');
  applyChange(s, a.key, 'deviation', { dimensions: ['LEGAL'], resolution: 'SEPARATE_VARIANT', justification: 'law', ownerId: 'p1', approval: 'APPROVED' });
});

test('activity split classes and aggregates', () => {
  const a = Object.values(s.assessments).find(x => x.deviation?.resolution === 'SEPARATE_VARIANT');
  assert.equal(classifySplit(a, s.processes[a.processId]), 'PLANNED_GBS_STAYS_LOCAL');
  const fit = Object.values(s.assessments).find(x => x.workshop.status === 'CONFIRMED_FIT' && s.processes[x.processId].toBe.gbs === true);
  assert.equal(classifySplit(fit, s.processes[fit.processId]), 'MOVES_TO_GBS');
  const split = activitySplit(s, a.entityCode, 'R2R');
  assert.equal(split.rows.length, 34);
  assert.ok(split.totals.cls.NOT_ASSESSED > 0 && split.totals.cls.MOVES_TO_GBS > 0);
  assert.ok(new Set(split.agg.map(g => g.level)).size === 2, 'L2 and L3 aggregates');
  assert.equal(split.totals.fte, 0.5);
});

test('gap analysis: distributions, change matrix, heatmap, cross-entity, drivers, open points', () => {
  const g = gapAnalysis(s, { stream: 'R2R' });
  assert.equal(g.n, 102);
  assert.ok(g.dist.ops.HARMONIZATION > 0 && g.dist.workshop.NO_GAP > 0);
  assert.equal(g.matrix.HARMONIZATION.HARMONIZATION, 1);
  assert.ok(g.matrix.NO_GAP.NO_GAP >= 1, 'bulk-confirmed NO GAP stays NO GAP');
  assert.ok(g.heat.length > 0 && Object.keys(g.heat[0].cells).length === 3);
  assert.equal(g.drivers.legalRegulatory, 1);
  assert.ok(g.cross.all.length + g.cross.one.length + g.cross.some.length > 0);
  assert.ok(g.openPoints.length > 0);
  assert.equal(g.side.country, g.side.country);
});

test('QG2 readiness: stream not ready while deviations lack owner/approval', () => {
  const q = qg2Readiness(s);
  assert.ok(q.streams.includes('R2R'));
  assert.equal(q.perStream.R2R.ready, false);
  assert.ok(q.perStream.R2R.noOwner > 0 || q.perStream.R2R.undecided > 0);
  const cell = q.cells.find(c => c.stream === 'R2R');
  assert.ok(cell.total > 0 && cell.assessed > 0);
});

test('PREPARE readiness: traffic light and missing pre-fills', () => {
  const r = prepareReadiness(s, { stream: 'R2R', participantIds: [], roomSent: false });
  assert.equal(r.checks[0].ok, true);
  assert.equal(r.light, 'red');
  assert.ok(r.checks[1].detail.includes('%')); assert.equal(r.checks.length, 4);
  const md = prepareReadiness(s, { stream: 'MD', participantIds: ['p1'], roomSent: true });
  assert.ok(md.activities > 0 && md.activities < r.activities + 500);
});

test('patchSheetXml replaces, inserts and clears cells while keeping styles', () => {
  const xml = '<worksheet><sheetData><row r="1" spans="1:3"><c r="A1" s="3" t="s"><v>0</v></c><c r="C1"><v>1</v></c></row><row r="3"/></sheetData></worksheet>';
  const { xml: out, written } = patchSheetXml(xml, { A1: 'Y', B1: 'n/a', C1: '', B3: 0.5, A2: 'x < y' });
  assert.equal(written, 5);
  assert.match(out, /<c r="A1" s="3" t="inlineStr"><is><t xml:space="preserve">Y<\/t><\/is><\/c><c r="B1" t="inlineStr">/);
  assert.match(out, /<c r="C1"\/>/);
  assert.match(out, /<row r="2"><c r="A2" t="inlineStr"><is><t xml:space="preserve">x &lt; y<\/t><\/is><\/c><\/row><row r="3"><c r="B3"><v>0.5<\/v><\/c><\/row>/);
});

test('write-back round trip: patched workbook re-imports with the workshop values, images survive', async () => {
  const a = Object.values(s.assessments).find(x => x.deviation?.resolution === 'SEPARATE_VARIANT');
  const file = a.sources[0].file;
  const cells = writeBackCells(s, file);
  assert.ok(Object.keys(cells).length === 1);
  const zip = await JSZip.loadAsync(readFileSync(join(dir, file)));
  const mediaBefore = Object.keys(zip.files).filter(n => n.startsWith('xl/media/')).length;
  const res = await writeBackWorkbook(zip, s, file);
  assert.ok(res.written > 10, `written ${res.written}`);
  const buf = await res.zip.generateAsync({ type: 'nodebuffer' });
  const wb = XLSX.read(buf, { type: 'buffer' });
  const parsed = parseCaptureWorkbook(wb, { XLSX, fileName: file });
  const back = parsed.assessments.find(x => x.entityCode === a.entityCode && x.processId === a.processId);
  assert.equal(back.fitGap.local, true); assert.equal(back.fitGap.gbs, false); assert.equal(back.fitGap.fte, 0.5);
  assert.equal(back.detailedGap.legalRegulatory, 'FEC & <audit>');
  assert.equal(back.detailedGap.itSystems, '', 'untouched cells stay empty');
  const fit = parsed.assessments.find(x => x.workshop.status !== 'NOT_ASSESSED' || x.detailedGap.itSystems === 'n/a');
  assert.ok(fit, 'bulk-confirmed rows written as n/a');
  const zip2 = await JSZip.loadAsync(buf);
  assert.equal(Object.keys(zip2.files).filter(n => n.startsWith('xl/media/')).length, mediaBefore);
  assert.ok(wb.SheetNames.includes('Cover') && wb.Sheets[parsed.sheetName]['!merges'].length > 0, 'merges and other sheets survive');
});

test('write-back leaves cells alone whose value the workshop did not change (keeps "x", spacing, shared strings)', () => {
  const t = createSession(); const f = readdirSync(dir).find(x => /R2R/.test(x));
  const p = parseCaptureWorkbook(XLSX.read(readFileSync(join(dir, f)), { type: 'buffer' }), { XLSX, fileName: f }); mergeParsedWorkbook(t, p);
  const a = Object.values(t.assessments).find(x => !x.scope.outOfScope && x.sources[0].cells.fitGap?.local && x.sources[0].cells.detailedGap?.itSystems);
  a.sources[0].imported = { fitGap: { local: true }, detailedGap: { itSystems: 'email' } }; a.detailedGap.itSystems = 'email';
  applyChange(t, a.key, 'fitGap.local', true); applyChange(t, a.key, 'fitGap.gbs', true);
  const cells = writeBackCells(t, f)[a.sources[0].sheet];
  const { local, gbs } = a.sources[0].cells.fitGap;
  assert.ok(!(local in cells), 'unchanged Y not rewritten'); assert.equal(cells[gbs], 'Y');
  assert.ok(!(a.sources[0].cells.detailedGap.itSystems in cells), 'unchanged text not rewritten');
  applyChange(t, a.key, 'detailedGap.itSystems', 'SAP');
  assert.equal(writeBackCells(t, f)[a.sources[0].sheet][a.sources[0].cells.detailedGap.itSystems], 'SAP');
});
