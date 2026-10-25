import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import { parseCaptureWorkbook, classifySheets, matchField } from '../src/parser/capture.js';
import { normalizeGap, parseEntityLabel, parseYN, parseNumber, looksLikeInstruction, parentIdFromStructure } from '../src/model/normalize.js';
import { createSession, mergeParsedWorkbook, importSummary, serializeSession, deserializeSession } from '../src/model/session.js';
import { PROFILE_CAPTURE_SHEET_V1 } from '../src/parser/profiles.js';

let dir, parsed = {};
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'fitgap-demo-'));
  execFileSync(process.execPath, ['scripts/generate-demo.mjs', dir], { stdio: 'ignore' });
  for (const f of readdirSync(dir)) {
    const wb = XLSX.read(readFileSync(join(dir, f)), { type: 'buffer' });
    const stream = f.match(/Template_([A-Z0-9_]+?)_France/)[1];
    parsed[stream] = parseCaptureWorkbook(wb, { XLSX, fileName: f });
  }
});

test('GAP normalisation maps the known variants', () => {
  const m = (v) => normalizeGap(v).value;
  assert.equal(m('NO GAP'), 'NO_GAP');
  assert.equal(m('no gap '), 'NO_GAP');
  assert.equal(m('HARMONIZATION GAP'), 'HARMONIZATION');
  assert.equal(m('Harmonisation'), 'HARMONIZATION');
  assert.equal(m('HARMINIZATION GAP'), 'HARMONIZATION');
  assert.equal(m('STANDARDIZATION GAP'), 'STANDARDIZATION');
  assert.equal(m('BOTH GAPs'), 'BOTH');
  assert.equal(m('Both'), 'BOTH');
  assert.equal(m('?'), 'UNCLEAR');
  assert.equal(m('N/A'), 'NA');
  assert.equal(m('Out of scope'), 'OUT_OF_SCOPE');
  assert.equal(m(' '), null);
  assert.equal(m(''), null);
  const u = normalizeGap('see comment');
  assert.equal(u.value, 'UNCLEAR'); assert.equal(u.mapped, false);
});

test('entity labels: code + name, parentheses stripped', () => {
  assert.deepEqual(parseEntityLabel('201023 Demo Vial S.A.S.'), { code: '201023', name: 'Demo Vial S.A.S.', raw: '201023 Demo Vial S.A.S.', outOfScope: false });
  const oos = parseEntityLabel('201060 Demo Logistics S.A.S. - out of scope'); assert.equal(oos.name, 'Demo Logistics S.A.S.'); assert.equal(oos.outOfScope, true);
  assert.equal(parseEntityLabel('201010 Demo Vial S.A.S. (201A)').name, 'Demo Vial S.A.S.');
  assert.deepEqual(parseEntityLabel('Demo Logistics SARL (incl. branch Lyon)').name, 'Demo Logistics SARL');
  assert.equal(parseEntityLabel('Demo Logistics SARL').code, null);
  assert.equal(parseEntityLabel('  '), null);
});

test('cell value helpers', () => {
  assert.equal(parseYN('Y'), true); assert.equal(parseYN('n'), false); assert.equal(parseYN(''), null); assert.deepEqual(parseYN('partly'), { text: 'partly' });
  assert.equal(parseNumber('0,5'), 0.5); assert.equal(parseNumber('1.25'), 1.25); assert.equal(parseNumber('x'), null);
  assert.equal(looksLikeInstruction('to be copied into Vial and completed by GBS Ops before the session'), true);
  assert.equal(looksLikeInstruction('SAP / SNOW'), false);
  assert.equal(parentIdFromStructure('R2R 2.1.1'), 'R2R 2.1'); assert.equal(parentIdFromStructure('R2R 2'), 'R2R'); assert.equal(parentIdFromStructure('R2R'), null);
});

test('sheet classification: old copies excluded, flows separated', () => {
  const c = classifySheets(['Cover', '>>', 'Fit-Gap Template_I2P_vold', 'Fit-Gap Template_I2P', 'Fit-Gap Template_I2P_v2', 'Process Flows_AP', 'Sheet1'], PROFILE_CAPTURE_SHEET_V1);
  assert.deepEqual(c.candidates, ['Fit-Gap Template_I2P']);
  assert.deepEqual(c.excludedOld, ['Fit-Gap Template_I2P_vold', 'Fit-Gap Template_I2P_v2']);
  assert.deepEqual(c.flows, ['Process Flows_AP']);
});

test('field matching is fuzzy but not greedy', () => {
  const f = PROFILE_CAPTURE_SHEET_V1.blocks.DETAILED.fields;
  assert.equal(matchField('Legal/Regulatory', f).field, 'legalRegulatory');
  assert.equal(matchField('Current Process (country specifics)', f).field, 'currentProcess');
  assert.equal(matchField('Workflow Tools', f).field, 'workflowTools');
  assert.equal(matchField('Process Level', f), null);
  const fg = PROFILE_CAPTURE_SHEET_V1.blocks.FITGAP.fields;
  assert.equal(matchField('Local Accounting (Y/N)', fg).field, 'local');
  assert.equal(matchField('GBS (Y/N)', fg).field, 'gbs');
});

test('all demo workbooks parse with 3 entities and 3 blocks each, no guessed entities', () => {
  for (const [stream, p] of Object.entries(parsed)) {
    assert.ok(p.ok, `${stream} parsed`);
    assert.equal(p.entities.length, 3, `${stream} entities`);
    for (const e of p.layout.entities) assert.deepEqual(e.blocks.sort(), ['ASIS', 'DETAILED', 'FITGAP'], `${stream} ${e.name} blocks`);
    assert.ok(!p.warnings.some(w => w.code === 'ENTITY_BY_ORDINAL' || w.code === 'ENTITY_UNKNOWN' || w.level === 'error'), `${stream} warnings: ${p.warnings.map(w => w.code)}`);
    assert.ok(!p.layout.blocks.some(b => b.kind === 'DETAILED' && b.missing.length), `${stream} detailed fields complete`);
    assert.equal(p.layout.blocks.filter(b => b.kind === 'FITGAP').length, 3);
  }
  assert.equal(parsed.R2R.layout.headerRow + 1, 8);
  assert.equal(parsed.A2R.layout.headerRow + 1, 9);
  assert.equal(parsed.I2P.layout.headerRow + 1, 6);
  assert.ok(parsed.R2R.warnings.some(w => w.code === 'ASIS_FROM_SUBHEADER'), 'R2R As-Is detected from sub-header');
  assert.ok(parsed.I2P.sheets.excludedOld.length === 1, 'I2P old sheet ignored');
  assert.ok(parsed.ICO.warnings.some(w => w.code === 'ROWS_SKIPPED'), 'ICO stray header skipped');
  assert.ok(parsed.A2R.assessments.some(a => a.scope.outOfScope), 'A2R has out-of-scope rows');
  assert.ok(parsed.A2R.layout.blocks.some(b => b.title === 'FIT-GAP ASSSSMENT'), 'typo title detected');
  assert.ok(parsed.I2C.entities.some(e => e.name === 'Demo Logistics SARL'), 'parenthesised suffix stripped');
  assert.ok(parsed.I2C.assessments.some(a => a.notes.length), 'instruction text captured as note');
  const withNote = parsed.I2C.assessments.find(a => a.notes.length);
  assert.equal(withNote.detailedGap.currentProcess, '', 'instruction text is not a value');
  const src = parsed.R2R.assessments[0].sources[0];
  assert.ok(src.cells.fitGap.local && src.cells.detailedGap.internalControls, 'cell addresses kept for write-back');
});

test('merge: I2C_CMD overlaps I2C without duplicates or diffs; workshop results survive re-import', () => {
  const s = createSession();
  const r1 = mergeParsedWorkbook(s, parsed.I2C);
  assert.equal(r1.assessments.added, parsed.I2C.assessments.length);
  const r2 = mergeParsedWorkbook(s, parsed.I2C_CMD);
  assert.equal(r2.processes.added, 0, 'CMD adds no new processes');
  assert.equal(r2.assessments.added, 0);
  assert.equal(r2.assessments.merged, parsed.I2C_CMD.assessments.length);
  assert.equal(r2.assessments.changedOps, 0, 'identical Ops values → no diffs');
  assert.equal(r2.processes.renamed.length, 0);
  const cmdKey = Object.keys(s.assessments).find(k => k.includes('I2C 1.1.1.1'));
  assert.equal(s.assessments[cmdKey].sources.length, 2, 'both source files kept');
  // Workshop edit, then re-import of the same file: workshop untouched.
  s.assessments[cmdKey].fitGap.local = true;
  s.assessments[cmdKey].workshop = { ...s.assessments[cmdKey].workshop, status: 'GAP_CONFIRMED', changedAt: new Date().toISOString() };
  const r3 = mergeParsedWorkbook(s, parsed.I2C);
  assert.equal(r3.assessments.protectedWorkshop >= 1, true);
  assert.equal(s.assessments[cmdKey].fitGap.local, true);
  assert.equal(s.assessments[cmdKey].workshop.status, 'GAP_CONFIRMED');
  for (const p of Object.values(parsed)) if (p !== parsed.I2C && p !== parsed.I2C_CMD) mergeParsedWorkbook(s, p);
  const sum = importSummary(s);
  assert.equal(sum.entities.length, 3);
  assert.deepEqual(sum.streams, ['A2R', 'I2C', 'I2P', 'ICO', 'R2R']);
  const back = deserializeSession(serializeSession(s));
  assert.equal(Object.keys(back.assessments).length, Object.keys(s.assessments).length);
});

test('entity without code is fuzzy-matched and flagged for confirmation', () => {
  const s = createSession();
  mergeParsedWorkbook(s, parsed.R2R);
  const fake = { ...parsed.ICO, fileName: 'fake.xlsx', entities: [{ code: 'name:demofrancesa', name: 'Demo France S.A.', hasCode: false }], processes: [], assessments: [] };
  const r = mergeParsedWorkbook(s, fake);
  assert.equal(r.entities.added.length + r.entities.merged.length + r.entities.pending.length, 1);
});
