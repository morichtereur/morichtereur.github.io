// Analysis: activity split classes, gap analysis (Ops vs. workshop, change
// matrix, heatmap, cross-entity, drivers, open points), QG2 readiness and
// PREPARE readiness. Pure functions on the session.
import { GAP, WORKSHOP_STATUS, DETAILED_GAP_FIELDS, RESOLUTION } from './constants.js';
import { effectiveGap, fitGapComplete, completeness, GAP_TYPES_WITH_DEVIATION, NA, isMasterDataNode } from './workshop.js';

export const SPLIT_CLASS = {
  MOVES_TO_GBS: 'Moves to GBS as planned', STAYS_LOCAL: 'Stays local as planned', PLANNED_GBS_STAYS_LOCAL: 'Planned for GBS, stays local',
  PLANNED_LOCAL_DONE_BY_GBS: 'Planned local, done by GBS', OTHER_PARTY: 'Other party involved', NOT_ASSESSED: 'Not assessed',
};
export const SPLIT_CLASS_KEYS = Object.keys(SPLIT_CLASS);

function lane(local, gbs) { if (gbs === true && local === true) return 'MIXED'; if (gbs === true) return 'GBS'; if (local === true) return 'LOCAL'; if (local === false && gbs === false) return 'NONE'; return null; }
export function lanesOf(a, p) {
  return { toBe: lane(p?.toBe?.le, p?.toBe?.gbs), ops: lane(a.asIs.le, a.asIs.gbs), workshop: fitGapComplete(a) ? lane(a.fitGap.local, a.fitGap.gbs) : null, other: a.fitGap.other === true };
}
export function classifySplit(a, p) {
  if (a.scope.outOfScope) return null;
  const l = lanesOf(a, p);
  if (!l.workshop) return 'NOT_ASSESSED';
  if (l.other) return 'OTHER_PARTY';
  const planGbs = l.toBe === 'GBS' || l.toBe === 'MIXED', planLocal = l.toBe === 'LOCAL';
  const wsGbs = l.workshop === 'GBS' || l.workshop === 'MIXED', wsLocal = l.workshop === 'LOCAL';
  if (planGbs && wsGbs) return 'MOVES_TO_GBS';
  if (planLocal && wsLocal) return 'STAYS_LOCAL';
  if (planGbs && wsLocal) return 'PLANNED_GBS_STAYS_LOCAL';
  if (planLocal && wsGbs) return 'PLANNED_LOCAL_DONE_BY_GBS';
  if (!l.toBe) return wsGbs ? 'MOVES_TO_GBS' : 'STAYS_LOCAL';
  return wsGbs ? 'MOVES_TO_GBS' : 'STAYS_LOCAL';
}

function ancestorAt(session, p, level) { let cur = p; while (cur && cur.level > level) cur = session.processes[cur.parentId]; return cur && cur.level === level ? cur : null; }

/** Activity split rows for one entity × stream (+ aggregates per L2 and L3). */
export function activitySplit(session, entityCode, stream) {
  const rows = [];
  for (const a of Object.values(session.assessments)) {
    if (a.entityCode !== entityCode || (stream && a.stream !== stream) || a.scope.outOfScope) continue;
    const p = session.processes[a.processId]; if (!p) continue;
    rows.push({ key: a.key, processId: a.processId, name: p.name, stream: a.stream, l2: ancestorAt(session, p, 1)?.id || '', l3: ancestorAt(session, p, 2)?.id || '', lanes: lanesOf(a, p), cls: classifySplit(a, p), fte: a.fitGap.fte || 0, gap: effectiveGap(a) });
  }
  rows.sort((x, y) => x.processId.localeCompare(y.processId, undefined, { numeric: true }));
  const agg = {};
  for (const r of rows) for (const node of [r.l2, r.l3]) { if (!node) continue; const g = agg[node] = agg[node] || { id: node, name: session.processes[node]?.name || node, level: session.processes[node]?.level, total: 0, fte: 0, cls: {} }; g.total++; g.fte += r.fte; g.cls[r.cls] = (g.cls[r.cls] || 0) + 1; }
  const totals = { total: rows.length, fte: rows.reduce((s, r) => s + r.fte, 0), cls: {} }; for (const r of rows) totals.cls[r.cls] = (totals.cls[r.cls] || 0) + 1;
  return { rows, agg: Object.values(agg).sort((x, y) => x.id.localeCompare(y.id, undefined, { numeric: true })), totals };
}

export const GAP_ORDER = ['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH', 'NA', 'UNCLEAR', 'NOT_ASSESSED'];

/** Gap analysis for a filter { entityCode?, stream? }. */
export function gapAnalysis(session, { entityCode = null, stream = null } = {}) {
  const list = Object.values(session.assessments).filter(a => !a.scope.outOfScope && (!entityCode || a.entityCode === entityCode) && (!stream || a.stream === stream));
  const dist = { ops: {}, workshop: {} }; const matrix = {}; const drivers = Object.fromEntries(DETAILED_GAP_FIELDS.map(f => [f, 0]));
  const heat = {}; const byActivity = {}; const openPoints = [];
  for (const a of list) {
    const o = a.asIs.gap || 'NOT_ASSESSED', w = a.workshop.gapType ? a.workshop.gapType : (a.workshop.status === WORKSHOP_STATUS.NOT_ASSESSED ? 'NOT_ASSESSED' : (effectiveGap(a) || 'NOT_ASSESSED'));
    dist.ops[o] = (dist.ops[o] || 0) + 1; dist.workshop[w] = (dist.workshop[w] || 0) + 1;
    matrix[o] = matrix[o] || {}; matrix[o][w] = (matrix[o][w] || 0) + 1;
    for (const f of DETAILED_GAP_FIELDS) if (a.detailedGap[f] && a.detailedGap[f] !== NA) drivers[f]++;
    const p = session.processes[a.processId]; const isGap = GAP_TYPES_WITH_DEVIATION.has(effectiveGap(a));
    for (const lvl of [1, 2]) { const n = ancestorAt(session, p, lvl); if (!n) continue; const h = heat[n.id] = heat[n.id] || { id: n.id, name: n.name, level: lvl, stream: n.stream, cells: {} }; const c = h.cells[a.entityCode] = h.cells[a.entityCode] || { total: 0, gaps: 0 }; c.total++; if (isGap) c.gaps++; }
    const b = byActivity[a.processId] = byActivity[a.processId] || { processId: a.processId, name: p?.name, stream: a.stream, entities: 0, gaps: [] }; b.entities++; if (isGap) b.gaps.push(a.entityCode);
    const c = completeness(a);
    if (a.workshop.status === WORKSHOP_STATUS.OPEN_QUESTION || (isGap && !c.complete) || effectiveGap(a) === GAP.UNCLEAR) openPoints.push({ key: a.key, entityCode: a.entityCode, processId: a.processId, name: p?.name, stream: a.stream, status: a.workshop.status, gap: effectiveGap(a), missing: c.missing, comment: a.workshop.comment, nextStep: a.workshop.nextStep, owner: a.workshop.owner, due: a.workshop.due });
  }
  const entityCount = new Set(list.map(a => a.entityCode)).size;
  const cross = { all: [], one: [], some: [] };
  for (const b of Object.values(byActivity)) { if (!b.gaps.length) continue; if (b.entities > 1 && b.gaps.length === b.entities) cross.all.push(b); else if (b.gaps.length === 1 && b.entities > 1) cross.one.push(b); else cross.some.push(b); }
  // Country side vs GBS side: where the gap sits by the workshop/ops lane of the activity.
  const side = { country: 0, gbs: 0, mixed: 0 };
  for (const a of list) { if (!GAP_TYPES_WITH_DEVIATION.has(effectiveGap(a))) continue; const l = lanesOf(a, session.processes[a.processId]); const ln = l.workshop || l.ops; if (ln === 'GBS') side.gbs++; else if (ln === 'LOCAL') side.country++; else side.mixed++; }
  openPoints.sort((x, y) => (x.status === WORKSHOP_STATUS.OPEN_QUESTION ? 0 : 1) - (y.status === WORKSHOP_STATUS.OPEN_QUESTION ? 0 : 1) || x.processId.localeCompare(y.processId, undefined, { numeric: true }));
  return { n: list.length, entityCount, dist, matrix, drivers, heat: Object.values(heat).sort((x, y) => x.id.localeCompare(y.id, undefined, { numeric: true })), cross, side, openPoints };
}

/** QG2 readiness per entity × stream and per stream. */
export function qg2Readiness(session) {
  const cells = {}; const streams = new Set();
  for (const a of Object.values(session.assessments)) {
    if (a.scope.outOfScope) continue; streams.add(a.stream);
    const c = cells[`${a.entityCode}::${a.stream}`] = cells[`${a.entityCode}::${a.stream}`] || { entityCode: a.entityCode, stream: a.stream, total: 0, assessed: 0, deviations: 0, byResolution: {}, noOwner: 0, noJustification: 0, noApproval: 0, openQuestions: 0, undecided: 0 };
    c.total++; if (a.workshop.status !== WORKSHOP_STATUS.NOT_ASSESSED) c.assessed++;
    if (a.workshop.status === WORKSHOP_STATUS.OPEN_QUESTION) c.openQuestions++;
    if (GAP_TYPES_WITH_DEVIATION.has(effectiveGap(a))) {
      c.deviations++; const d = a.deviation || {};
      const r = d.resolution || 'UNDECIDED'; c.byResolution[r] = (c.byResolution[r] || 0) + 1; if (!d.resolution) c.undecided++;
      if (!d.ownerId) c.noOwner++;
      if (d.resolution === RESOLUTION.SEPARATE_VARIANT && !d.justification?.trim()) c.noJustification++;
      if (!d.approval || d.approval === 'PROPOSED') c.noApproval++;
    }
  }
  const perStream = {};
  for (const s of streams) {
    const list = Object.values(cells).filter(c => c.stream === s);
    const sum = (k) => list.reduce((x, c) => x + c[k], 0);
    const ready = sum('assessed') === sum('total') && sum('noOwner') === 0 && sum('undecided') === 0 && sum('noApproval') === 0 && sum('noJustification') === 0 && sum('total') > 0;
    perStream[s] = { stream: s, total: sum('total'), assessed: sum('assessed'), deviations: sum('deviations'), noOwner: sum('noOwner'), undecided: sum('undecided'), noApproval: sum('noApproval'), noJustification: sum('noJustification'), openQuestions: sum('openQuestions'), ready, signoff: session.signoff?.[s] || { pe: { name: '', date: '' }, ops: { name: '', date: '' } } };
  }
  return { cells: Object.values(cells), streams: [...streams].sort(), perStream };
}

/** PREPARE readiness for one planned session. */
export function prepareReadiness(session, ws, flowsByNode = {}) {
  const streams = ws.stream === 'MD' ? null : [ws.stream.replace(/-.*$/, '')];
  const inStream = (a) => (!streams || streams.includes(a.stream)) && (ws.stream !== 'MD' || isMasterDataNode(session.processes[a.processId] || {}));
  const list = Object.values(session.assessments).filter(a => !a.scope.outOfScope && inStream(a));
  const fileReceived = ws.stream === 'MD' ? session.files.length > 0 : session.files.some(f => f.streams.includes(streams[0]));
  const withGap = list.filter(a => a.asIs.gap !== null).length;
  const leafIds = new Set(list.map(a => session.processes[a.processId]?.parentId).filter(Boolean));
  const leavesWithFlow = [...leafIds].filter(id => { let cur = session.processes[id]; while (cur) { if (flowsByNode[cur.id]) return true; cur = session.processes[cur.parentId]; } return false; }).length;
  const missing = list.filter(a => a.asIs.gap === null).map(a => ({ entityCode: a.entityCode, processId: a.processId, name: session.processes[a.processId]?.name }));
  const checks = [
    { key: 'file', label: 'Capture sheet received', ok: fileReceived, detail: fileReceived ? 'imported' : 'no file for this stream' },
    { key: 'ops', label: 'Ops pre-assessment complete', ok: list.length > 0 && withGap === list.length, warn: list.length > 0 && withGap / list.length >= 0.9, detail: list.length ? `${Math.round(100 * withGap / list.length)} % of ${list.length} As-Is GAP cells filled` : 'no activities' },
    { key: 'participants', label: 'Participants nominated', ok: (ws.participantIds || []).length > 0, detail: `${(ws.participantIds || []).length} nominated` },
    { key: 'room', label: 'Room / link sent', ok: !!ws.roomSent, detail: ws.roomSent ? 'sent' : 'not yet' },
  ];
  const light = checks.every(c => c.ok) ? 'green' : checks.every(c => c.ok || c.warn) ? 'amber' : 'red';
  return { checks, light, missing, activities: list.length };
}
