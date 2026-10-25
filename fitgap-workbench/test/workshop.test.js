import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import { parseCaptureWorkbook } from '../src/parser/capture.js';
import { createSession, mergeParsedWorkbook } from '../src/model/session.js';
import { applyChange, completeness, confirmFit, bulkConfirmNoGap, undoBulk, buildTree, activitiesOf, nodeStats, suggestGapType, applyToAllEntities, sessionPace, undoAction, redoAction, setEffortHours, setEffortFte, rebaseFte, hoursOf, effortSum, fteBasis } from '../src/model/workshop.js';
import { flatRows } from '../src/model/exports.js';

let session;
before(() => {
  const dir = mkdtempSync(join(tmpdir(), 'fitgap-ws-'));
  execFileSync(process.execPath, ['scripts/generate-demo.mjs', dir], { stdio: 'ignore' });
  session = createSession();
  for (const f of readdirSync(dir)) mergeParsedWorkbook(session, parseCaptureWorkbook(XLSX.read(readFileSync(join(dir, f)), { type: 'buffer' }), { XLSX, fileName: f }));
});

test('applyChange writes the audit trail and marks the assessment as touched', () => {
  const key = Object.keys(session.assessments).find(k => k.endsWith('R2R 1.1.1.1'));
  const n = session.audit.length;
  assert.equal(applyChange(session, key, 'fitGap.local', true), true);
  assert.equal(applyChange(session, key, 'fitGap.local', true), false, 'no entry for unchanged value');
  assert.equal(session.audit.length, n + 1);
  assert.deepEqual(session.audit.at(-1).field, 'fitGap.local');
  assert.ok(session.assessments[key].workshop.changedAt);
});

test('completeness: gap types require rationale, detailed gap and deviation fields', () => {
  const a = Object.values(session.assessments).find(x => x.asIs.gap === 'HARMONIZATION' && !x.scope.outOfScope);
  const c = completeness(a);
  assert.equal(c.complete, false);
  assert.ok(c.missing.includes('Rationale') && c.missing.includes('Accountable owner'));
  const fit = Object.values(session.assessments).find(x => x.asIs.gap === 'NO_GAP' && !x.scope.outOfScope);
  assert.ok(completeness(fit).missing.includes('Fit-Gap split (Local / Other / GBS)'));
  const oos = Object.values(session.assessments).find(x => x.scope.outOfScope);
  assert.equal(completeness(oos).complete, true);
});

test('confirm as fit fills split from To-Be, Detailed Gap n/a and sets NO GAP', () => {
  const a = Object.values(session.assessments).find(x => x.asIs.gap === 'NO_GAP' && !x.scope.outOfScope && x.workshop.status === 'NOT_ASSESSED');
  assert.ok(confirmFit(session, a.key, session.processes[a.processId]));
  assert.equal(a.workshop.status, 'CONFIRMED_FIT');
  assert.equal(a.workshop.gapType, 'NO_GAP');
  assert.equal(a.detailedGap.itSystems, 'n/a');
  assert.equal(completeness(a).complete, true);
  assert.equal(a.fitGap.gbs, session.processes[a.processId].toBe.gbs);
});

test('bulk confirm NO GAP for one L3 and undo it', () => {
  const tree = buildTree(session, 'I2P');
  const l3 = tree[0].children[0].children[0];
  const acts = activitiesOf(l3);
  const keys = Object.values(session.assessments).filter(a => acts.some(p => p.id === a.processId)).map(a => a.key);
  const before = nodeStats(session, acts);
  const { bulkId, count } = bulkConfirmNoGap(session, keys, session.processes);
  assert.equal(count, before.opsNoGap);
  assert.ok(count > 0);
  const after = nodeStats(session, acts);
  assert.equal(after.assessed, before.assessed + count);
  const undone = undoBulk(session, bulkId);
  assert.ok(undone > 0);
  const back = nodeStats(session, acts);
  assert.equal(back.assessed, before.assessed);
  assert.equal(back.opsNoGap, before.opsNoGap);
});

test('harmonization is suggested when the workshop split differs from To-Be', () => {
  const a = Object.values(session.assessments).find(x => x.asIs.gap === 'NO_GAP' && !x.scope.outOfScope && x.workshop.status === 'NOT_ASSESSED' && session.processes[x.processId].toBe.gbs === true);
  applyChange(session, a.key, 'fitGap.local', true); applyChange(session, a.key, 'fitGap.other', false); applyChange(session, a.key, 'fitGap.gbs', false);
  assert.equal(suggestGapType(a, session.processes[a.processId]), 'HARMONIZATION');
  const n = applyToAllEntities(session, a.key);
  assert.ok(n >= 2);
  const sibling = Object.values(session.assessments).find(x => x.processId === a.processId && x.key !== a.key);
  assert.equal(sibling.fitGap.local, true);
});

test('MD tree holds only master-data nodes across streams; pace uses planned minutes', () => {
  const md = buildTree(session, null, { masterDataOnly: true });
  const acts = md.flatMap(activitiesOf);
  assert.ok(acts.length > 0);
  assert.ok(new Set(acts.map(p => p.stream)).size >= 3, 'several streams');
  for (const p of acts) { let n = session.processes[p.parentId], hit = false; while (n) { if (/master data/i.test(n.name)) hit = true; n = session.processes[n.parentId]; } assert.ok(hit, `${p.id} has a master-data ancestor`); }
  session.sessions.push({ id: 's1', date: '2026-10-19', start: '14:00', end: '15:30', stream: 'R2R', participantIds: [], startedAt: new Date(Date.now() - 30 * 60000).toISOString() });
  session.activeSessionId = 's1';
  const p = sessionPace(session);
  assert.equal(p.planned, 90); assert.equal(p.elapsed, 30); assert.equal(p.left, 60);
  assert.ok(p.remaining > 0 && p.secPerActivity > 0);
});

test('undo / redo revert and re-apply one user step as a whole, logged in the audit trail', () => {
  const a = Object.values(session.assessments).find(x => x.asIs.gap === 'NO_GAP' && !x.scope.outOfScope && x.workshop.status === 'NOT_ASSESSED');
  const before = JSON.stringify({ w: a.workshop.status, g: a.workshop.gapType, f: a.fitGap, d: a.detailedGap });
  Object.defineProperty(session, '_actionId', { value: 'act_test', configurable: true, writable: true, enumerable: false });
  assert.ok(confirmFit(session, a.key, session.processes[a.processId]));
  delete session._actionId;
  const step = session.audit.filter(e => e.actionId === 'act_test');
  assert.ok(step.length >= 3, `one step, several fields (${step.length})`);
  assert.ok(!JSON.parse(serializeLike(session)).hasOwnProperty('_actionId'), 'the action id is never saved');
  const n = undoAction(session, 'act_test');
  assert.equal(n, step.length);
  assert.equal(JSON.stringify({ w: a.workshop.status, g: a.workshop.gapType, f: a.fitGap, d: a.detailedGap }), before);
  assert.ok(session.audit.filter(e => e.actionId === 'undo:act_test').every(e => e.note === 'undo'));
  assert.equal(redoAction(session, 'act_test'), step.length);
  assert.equal(a.workshop.status, 'CONFIRMED_FIT');
  assert.equal(undoAction(session, 'no_such_step'), 0);
});
function serializeLike(s) { return JSON.stringify(s); }

test('effort in hours per month: FTE derived with the basis, recalculated when the basis changes', () => {
  const [a, b] = Object.values(session.assessments).filter(x => !x.scope.outOfScope).slice(10, 12);
  assert.equal(fteBasis(session), 140);
  assert.ok(setEffortHours(session, a.key, 28));
  assert.equal(a.fitGap.hours, 28); assert.equal(a.fitGap.fte, 0.2);
  b.fitGap.fte = 0.5; b.fitGap.hours = null; // e.g. the Ops pre-fill
  assert.equal(hoursOf(session, b), 70, 'hours estimated from an imported FTE');
  assert.deepEqual(effortSum(session, [a, b]), { hours: 98, fte: 0.7, withValue: 2 });
  assert.equal(rebaseFte(session, 160), 1, 'only FTE derived from hours is recalculated');
  assert.equal(a.fitGap.fte, 0.18); assert.equal(b.fitGap.fte, 0.5);
  const row = flatRows(session).find(r => r['Process ID'] === a.processId && r['Entity code'] === a.entityCode);
  assert.equal(row['Hours / month'], 28); assert.equal(row['FTE'], 0.18); assert.equal(row['FTE basis (h/month)'], 160);
  assert.ok(setEffortFte(session, a.key, 0.25));
  assert.equal(a.fitGap.hours, null, 'direct FTE entry clears captured hours'); assert.equal(a.fitGap.fte, 0.25);
  Object.defineProperty(session, '_actionId', { value: 'act_h', configurable: true, writable: true, enumerable: false });
  setEffortHours(session, a.key, 7); delete session._actionId;
  undoAction(session, 'act_h'); assert.equal(a.fitGap.fte, 0.25); assert.equal(a.fitGap.hours, null, 'hours and FTE undo together');
  rebaseFte(session, 140);
});
