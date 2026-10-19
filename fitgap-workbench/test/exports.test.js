import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import { parseCaptureWorkbook } from '../src/parser/capture.js';
import { createSession, mergeParsedWorkbook, serializeSession, deserializeSession } from '../src/model/session.js';
import { applyChange, confirmFit, bulkConfirmNoGap, completeness } from '../src/model/workshop.js';
import { deviationRows, initiativeRows, flatRows, auditRows, buildDeviationLogWorkbook, buildFlatWorkbook, polishXlsx } from '../src/model/exports.js';
import JSZip from 'jszip';

let s;
before(() => {
  const dir = mkdtempSync(join(tmpdir(), 'fitgap-ex-'));
  execFileSync(process.execPath, ['scripts/generate-demo.mjs', dir], { stdio: 'ignore' });
  s = createSession();
  for (const f of readdirSync(dir)) mergeParsedWorkbook(s, parseCaptureWorkbook(XLSX.read(readFileSync(join(dir, f)), { type: 'buffer' }), { XLSX, fileName: f }));
  s.settings.clientName = 'Demo Group'; s.settings.country = 'France'; s.settings.editorInitials = 'MR';
  s.participants.push({ id: 'p1', name: 'M. Dupont', role: 'GL', organisation: 'Local' });
  s.sessions.push({ id: 'ws1', date: '2026-10-19', start: '14:00', end: '15:30', stream: 'R2R', participantIds: ['p1'] }); s.activeSessionId = 'ws1';
  const keys = Object.values(s.assessments).filter(a => a.stream === 'R2R').map(a => a.key);
  bulkConfirmNoGap(s, keys, s.processes);
  const devs = Object.values(s.assessments).filter(a => a.stream === 'R2R' && a.asIs.gap === 'HARMONIZATION' && !a.scope.outOfScope).slice(0, 3);
  for (const a of devs) { applyChange(s, a.key, 'fitGap.local', true); applyChange(s, a.key, 'fitGap.other', false); applyChange(s, a.key, 'fitGap.gbs', false); applyChange(s, a.key, 'workshop.gapType', 'HARMONIZATION'); applyChange(s, a.key, 'workshop.rationale', 'Local approval'); applyChange(s, a.key, 'detailedGap.legalRegulatory', 'FEC'); applyChange(s, a.key, 'deviation', { dimensions: ['LEGAL'], resolution: 'SEPARATE_VARIANT', justification: 'French tax code', ownerId: 'p1', targetDate: '2026-12-01', escalation: 'L2', approval: 'PROPOSED' }); applyChange(s, a.key, 'workshop.status', 'GAP_CONFIRMED'); }
  const std = Object.values(s.assessments).find(a => a.asIs.gap === 'STANDARDIZATION' && !a.scope.outOfScope);
  applyChange(s, std.key, 'workshop.gapType', 'STANDARDIZATION'); applyChange(s, std.key, 'workshop.rationale', 'Excel upload'); applyChange(s, std.key, 'deviation', { dimensions: ['IT_SYSTEMS'], resolution: 'LIFT_AND_SHIFT', ownerId: 'p1', initiativeCandidate: true, linkedInitiative: 'INI-042' });
  s.taxonomyChangeRequests.push({ id: 't1', processId: 'R2R 1.1.1.1', proposedChange: 'Split into two activities', reason: 'Two systems', raisedBy: 'MR', sessionId: 'ws1', ts: new Date().toISOString() });
});

test('deviation log: every effective gap in scope, mandatory columns filled for the three decided deviations', () => {
  const rows = deviationRows(s);
  const decided = rows.filter(r => r['Resolution approach'] === 'Separate variant');
  assert.equal(decided.length, 3);
  for (const r of decided) { assert.equal(r['Accountable owner'], 'M. Dupont (Local)'); assert.equal(r['Session'], '2026-10-19 14:00 R2R'); assert.equal(r['Escalation level'], 'L2 Quality Gate Committee / Transition Lead'); assert.ok(r['Last change']); assert.equal(r['Changed by'], 'MR'); assert.match(r['Detailed gap findings'], /Legal \/ Regulatory: FEC/); }
  assert.ok(rows.length > decided.length, 'Ops gaps without workshop decision are listed too');
  assert.ok(rows.every(r => r['Gap type (workshop)'] !== 'NO GAP'));
  const ini = initiativeRows(s);
  assert.ok(ini.some(r => r['Linked initiative'] === 'INI-042'));
});

test('flat export: one row per assessment with all columns; audit rows resolve entity and process', () => {
  const rows = flatRows(s);
  assert.equal(rows.length, Object.keys(s.assessments).length);
  const cols = Object.keys(rows[0]);
  for (const c of ['Entity', 'Process ID', 'Ops GAP', 'Fit-Gap GBS', 'DG Legal / Regulatory', 'Workshop gap type', 'Resolution approach', 'Source files']) assert.ok(cols.includes(c), c);
  const au = auditRows(s);
  assert.ok(au.length > 50);
  assert.ok(au.some(r => r['Bulk']));
  assert.ok(au.filter(r => r['Field'] !== 'import').every(r => r['Editor'] === 'MR'));
});

test('workbooks round-trip through SheetJS with the expected sheets and row counts', () => {
  const dev = XLSX.read(XLSX.write(buildDeviationLogWorkbook(s, XLSX), { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  assert.deepEqual(dev.SheetNames, ['Deviation log', 'Initiative candidates', 'Taxonomy change requests', 'About']);
  assert.equal(XLSX.utils.sheet_to_json(dev.Sheets['Deviation log']).length, deviationRows(s).length);
  assert.equal(XLSX.utils.sheet_to_json(dev.Sheets['Taxonomy change requests']).length, 1);
  const flat = XLSX.read(XLSX.write(buildFlatWorkbook(s, XLSX), { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  assert.deepEqual(flat.SheetNames, ['Assessments', 'Audit log', 'Sessions', 'Participants', 'Feedback']);
  assert.equal(XLSX.utils.sheet_to_json(flat.Sheets['Assessments']).length, Object.keys(s.assessments).length);
});

test('session JSON round-trip keeps workshop results, audit and plan data', () => {
  const back = deserializeSession(serializeSession(s));
  assert.equal(back.audit.length, s.audit.length);
  assert.equal(back.sessions.length, 1); assert.equal(back.participants.length, 1);
  const k = Object.values(s.assessments).find(a => a.deviation?.resolution === 'SEPARATE_VARIANT').key;
  assert.deepEqual(back.assessments[k].deviation, s.assessments[k].deviation);
  assert.equal(completeness(back.assessments[k]).complete, true);
});

test('polished workbooks: header row frozen and styled, data unchanged', async () => {
  const raw = new Uint8Array(XLSX.write(buildDeviationLogWorkbook(s, XLSX), { bookType: 'xlsx', type: 'array' }));
  const out = await polishXlsx(raw, JSZip);
  const a = XLSX.read(raw, { type: 'array' }), b = XLSX.read(out, { type: 'array' });
  assert.deepEqual(b.SheetNames, a.SheetNames);
  for (const n of a.SheetNames) assert.deepEqual(XLSX.utils.sheet_to_json(b.Sheets[n]), XLSX.utils.sheet_to_json(a.Sheets[n]), n);
  const zip = await JSZip.loadAsync(out); const styles = await zip.file('xl/styles.xml').async('string'); const sheet1 = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(sheet1, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  const xf = Number(sheet1.match(/<row r="1"[^>]*>\s*<c [^>]*s="(\d+)"/)[1]);
  const xfs = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].match(/<xf /g).length;
  assert.equal(xf, xfs - 1, 'header cells use the appended style');
  assert.match(styles, /<fgColor rgb="FF1F4E79"\/>/);
  assert.ok(out.length < raw.length, 'compressed');
});
