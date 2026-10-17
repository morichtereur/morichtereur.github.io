import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import { parseCaptureWorkbook } from '../src/parser/capture.js';
import { createSession, mergeParsedWorkbook } from '../src/model/session.js';
import { applyChange, completeness, confirmFit, bulkConfirmNoGap, undoBulk, buildTree, activitiesOf, nodeStats, suggestGapType, applyToAllEntities, sessionPace } from '../src/model/workshop.js';

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
