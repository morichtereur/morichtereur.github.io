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
for (const m of ['00-util.js', '10-profile.js', '15-demo.js', '20-parser.js', '30-model.js', '32-workshop.js', '35-planning.js']) require(path.join(here, '..', 'src', 'js', m));
const FG = globalThis.FG, W = FG.workshop, M = FG.model;
const demoDir = path.join(here, '..', 'samples', 'demo');
if (!fs.existsSync(path.join(demoDir, 'Demo_FitGap_R2R.xlsx'))) { fs.mkdirSync(demoDir, { recursive: true }); for (const f of FG.demo.buildWorkbooks(XLSX)) XLSX.writeFile(f.wb, path.join(demoDir, f.name)); }
const parse = (name) => FG.parser.parseWorkbook(XLSX.readFile(path.join(demoDir, name)), { fileName: name });
function session() { const s = M.createSession(); M.mergeImport(s, parse('Demo_FitGap_R2R.xlsx')); s.settings.editorInitials = 'MR'; return s; }
const findKey = (s, pred) => Object.values(s.assessments).find(pred).key;

test('setField logs audit with session + editor and skips no-ops', () => {
  const s = session(); const k = findKey(s, a => a.asIs.gap === 'NO_GAP');
  const n0 = s.audit.length;
  assert.equal(W.setField(s, k, 'fitGap.local', 'Y'), true);
  assert.equal(W.setField(s, k, 'fitGap.local', 'Y'), false);
  assert.equal(s.audit.length, n0 + 1);
  const e = s.audit[s.audit.length - 1];
  assert.deepEqual([e.field, e.old, e.new, e.editor], ['workshop.fitGap.local', null, 'Y', 'MR']);
  assert.ok(s.assessments[k].workshop.changedAt);
});

test('completeness rules: fit vs gap vs out of scope', () => {
  const s = session(); const k = findKey(s, a => a.asIs.gap === 'NO_GAP'); const a = s.assessments[k], p = s.processes[a.processId];
  assert.equal(W.completeness(a, p).done, false);
  W.confirmFit(s, k);
  const c = W.completeness(a, p); assert.deepEqual([c.done, a.workshop.status, a.workshop.gapType, a.workshop.detailedGap.na], [true, 'CONFIRMED_FIT', 'NO_GAP', true]);
  // turn into a gap → needs rationale, DG field, deviation
  W.setField(s, k, 'gapType', 'HARMONIZATION');
  let m = W.completeness(a, p).missing;
  assert.ok(m.includes('rationale') && m.includes('at least one Detailed Gap field') && m.includes('accountable owner') && m.includes('resolution approach'));
  W.setField(s, k, 'rationale', 'local tax rule'); W.setField(s, k, 'detailedGap.legal', 'FR statutory'); W.setField(s, k, 'deviation', { dimensions: ['Legal'], resolution: 'SEPARATE_VARIANT', owner: 'x', justification: '', escalation: 'L1', approval: 'PROPOSED' });
  m = W.completeness(a, p).missing; assert.deepEqual(m, ['justification (separate variant)']);
  W.setField(s, k, 'deviation.justification', 'Art. 123 CGI'); assert.equal(W.completeness(a, p).done, true);
  W.setField(s, k, 'status', 'OUT_OF_SCOPE'); assert.deepEqual(W.completeness(a, p).missing, ['reason for out of scope (comment)']);
});

test('suggestions: harmonization delta when split differs from To-Be', () => {
  const s = session(); const a = Object.values(s.assessments).find(x => s.processes[x.processId].toBe.gbs === 'Y' && x.asIs.gap === 'NO_GAP'); const p = s.processes[a.processId];
  assert.equal(W.suggest(a, p).confirmFit, true);
  W.setField(s, a.key, 'fitGap.local', 'Y'); W.setField(s, a.key, 'fitGap.other', 'N'); W.setField(s, a.key, 'fitGap.gbs', 'N');
  const sg = W.suggest(a, p); assert.equal(sg.harmonization, 'To-Be: GBS → Workshop: Local'); assert.equal(sg.confirmFit, false);
});

test('bulk confirm per L3 + undo; progress and FTE impact', () => {
  const s = session(); const ents = M.entityList(s).map(e => e.key);
  const l3 = 'R2R 1.1.1'; const before = W.nodeProgress(s, l3, ents);
  const noGap = before.opsMix.NO_GAP || 0;
  const u = W.bulkConfirm(s, l3, ents);
  assert.equal(u.keys.length, noGap);
  const after = W.nodeProgress(s, l3, ents);
  assert.equal(after.byStatus.CONFIRMED_FIT, noGap);
  assert.ok(s.audit.some(e => e.kind === 'bulk' && e.keys && e.keys.length === noGap));
  W.undoBulk(s, u); assert.equal(W.nodeProgress(s, l3, ents).byStatus.CONFIRMED_FIT || 0, 0);
  // FTE
  const act = W.descendants(s, l3).filter(p => p.isActivity)[0]; const k = M.aKey(ents[0], act.id);
  W.setField(s, k, 'fitGap.local', 'Y'); W.setField(s, k, 'fitGap.other', 'N'); W.setField(s, k, 'fitGap.gbs', 'Y'); W.setField(s, k, 'fitGap.fte', 1.0);
  const pr = W.nodeProgress(s, l3, ents);
  assert.equal(pr.fte.total, 1); assert.equal(pr.fte.gbs, 0.5); assert.equal(pr.fte.local, 0.5); assert.equal(pr.fte.withFte, 1);
});

test('apply to all entities and copy detailed gap from previous', () => {
  const s = session(); const ents = M.entityList(s).map(e => e.key);
  const acts = W.descendants(s, 'R2R 1.1.1').filter(p => p.isActivity);
  const k0 = M.aKey(ents[0], acts[0].id), k1 = M.aKey(ents[0], acts[1].id);
  W.setField(s, k0, 'detailedGap.itSystems', 'SAP'); W.setField(s, k0, 'gapType', 'STANDARDIZATION'); W.setField(s, k0, 'status', 'GAP');
  assert.equal(W.applyToAllEntities(s, k0), ents.length - 1);
  assert.equal(s.assessments[M.aKey(ents[1], acts[0].id)].workshop.detailedGap.itSystems, 'SAP');
  assert.equal(W.copyDetailedGapFromPrevious(s, k1), acts[0].id);
  assert.equal(s.assessments[k1].workshop.detailedGap.itSystems, 'SAP');
});

test('participants, sessions, timer', () => {
  const s = session();
  const p = W.addParticipant(s, { name: 'Anna', role: 'Chief accountant', organisation: 'Local' });
  const ws = W.addSession(s, { date: '2026-10-21', start: '14:00', end: '15:30', stream: 'R2R', participants: [p.id] });
  W.startSession(s, ws.id); assert.equal(s.activeSessionId, ws.id);
  const k = findKey(s, a => a.asIs.gap === 'NO_GAP'); W.confirmFit(s, k);
  assert.equal(s.assessments[k].workshop.session, ws.id);
  const t = W.timer(s, new Date('2026-10-21T14:30:00').getTime());
  assert.equal(t.plannedS, 5400); assert.equal(t.leftS, 3600); assert.equal(t.done, 0); assert.ok(t.paceS > 0 && t.remaining > 100);
  W.endSession(s); assert.equal(s.activeSessionId, null); assert.equal(ws.status, 'done');
  W.removeParticipant(s, p.id); assert.deepEqual(ws.participants, []);
});

test('planning workbook: free-text dates and times → sessions for review', () => {
  const P = FG.planning;
  assert.deepEqual(P.parseDates('19.10.2026 and 20.10.2026'), ['2026-10-19', '2026-10-20']);
  assert.deepEqual(P.parseDates(46040), ['2026-01-18']);
  assert.deepEqual(P.parseTimes('Monday from 10:00-12:00 and 13:00-16:00').ranges, [{ start: '10:00', end: '12:00' }, { start: '13:00', end: '16:00' }]);
  assert.deepEqual(P.parseTimes('9:00-11:00 CET'), { ranges: [{ start: '09:00', end: '11:00' }], tz: 'CET' });
  assert.equal(P.parseTimes('9am to 1pm KST').tz, 'KST');
  assert.equal(P.parseDuration('3h'), 180); assert.equal(P.parseDuration(1.5), 90);
  assert.equal(P.mapStream('Record-to-Report'), 'R2R'); assert.equal(P.mapStream('Travel-and-Expense'), 'I2P'); assert.equal(P.mapStream('Master Data'), 'MD');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['old']]), 'Old');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Fit Gap Workshops'], [],
    ['Country', 'PROCESS', 'Responsible', 'Comment', 'Workshop Date', 'Meeting time', 'Overall Duration', 'Status'],
    ['France', 'Record-to-Report', 'J. Doe', '', '19.10.2026 and 20.10.2026', 'Monday from 10:00-12:00 and 13:00-16:00', '5h', 'confirmed with PE and RO'],
    ['', 'Invoice-to-Pay', 'A. Roe', '', '21.10.2026', '9:00-11:00 CET', '2h', 'invite sent'],
    ['KR', 'Order-to-Cash', 'K. Lee', '', 'tbd', '9am to 1pm KST', '', ''],
  ]), 'New');
  const r = P.parsePlanningWorkbook(wb, { year: 2026 });
  assert.ok(r.ok, r.error); assert.equal(r.sheet, 'New'); assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows[0].sessions, [{ date: '2026-10-19', start: '10:00', end: '12:00' }, { date: '2026-10-20', start: '13:00', end: '16:00' }]);
  assert.equal(r.rows[1].country, 'France'); assert.equal(r.rows[1].stream, 'I2P');
  assert.ok(r.rows[2].flags.includes('no date recognised') && r.rows[2].flags.includes('time zone KST'));
});
