// Workshop rules: every change goes through applyChange (audit trail), plus the
// derived views the screen needs – effective gap type, completeness, tree stats,
// confirm-as-fit and bulk confirmation with undo. Pure functions on the session.
import { GAP, WORKSHOP_STATUS, DETAILED_GAP_FIELDS, RESOLUTION } from './constants.js';
import { newId } from './session.js';

export const GAP_TYPES_WITH_DEVIATION = new Set([GAP.HARMONIZATION, GAP.STANDARDIZATION, GAP.BOTH]);
export const NA = 'n/a';

function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function setPath(obj, path, value) { const ks = path.split('.'); let o = obj; for (const k of ks.slice(0, -1)) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; } o[ks[ks.length - 1]] = value; }
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Meta for audit entries: { sessionId, editor, bulkId? }. */
export function auditMeta(session, extra = {}) { return { sessionId: session.activeSessionId, editor: session.settings.editorInitials || '', ...extra }; }

/** Set one field of an assessment, record the change. Returns true when something changed. */
export function applyChange(session, key, path, value, meta = auditMeta(session)) {
  const a = session.assessments[key]; if (!a) return false;
  const old = getPath(a, path);
  if (same(old, value)) return false;
  setPath(a, path, value);
  const ts = new Date().toISOString();
  a.workshop.changedAt = ts;
  session.audit.push({ ts, key, field: path, old: old === undefined ? null : old, new: value, sessionId: meta.sessionId ?? null, editor: meta.editor ?? '', bulkId: meta.bulkId || null, note: meta.note || null });
  return true;
}

export function effectiveGap(a) { return a.workshop.gapType || a.asIs.gap || null; }
export function gapDiffersFromOps(a) { return !!a.workshop.gapType && a.workshop.gapType !== a.asIs.gap; }
export function fitGapComplete(a) { return [a.fitGap.local, a.fitGap.other, a.fitGap.gbs].every(v => v === true || v === false); }
export function detailedGapFilled(a) { return DETAILED_GAP_FIELDS.filter(f => a.detailedGap[f] && a.detailedGap[f] !== NA); }
export function detailedGapTouched(a) { return DETAILED_GAP_FIELDS.filter(f => a.detailedGap[f]); }

/** Fit-Gap split vs. To-Be split: returns { differs, toBe: 'GBS'|'Local'|'Both'|'?', workshop } */
export function splitDelta(a, process) {
  const tb = process?.toBe || {};
  const lane = (local, gbs, other) => { const parts = []; if (local === true) parts.push('Local'); if (other === true) parts.push('Other'); if (gbs === true) parts.push('GBS'); return parts.length ? parts.join(' + ') : (local === false || gbs === false ? 'none' : '?'); };
  const toBe = lane(tb.le, tb.gbs, false), ws = fitGapComplete(a) ? lane(a.fitGap.local, a.fitGap.gbs, a.fitGap.other) : '?';
  const known = toBe !== '?' && ws !== '?';
  return { toBe, workshop: ws, differs: known && toBe !== ws, known };
}

/** Suggested workshop gap type from the split delta and the Ops value. */
export function suggestGapType(a, process) {
  const d = splitDelta(a, process);
  if (!d.known) return null;
  const ops = a.asIs.gap;
  if (d.differs) return ops === GAP.STANDARDIZATION || ops === GAP.BOTH ? GAP.BOTH : GAP.HARMONIZATION;
  if (ops === GAP.HARMONIZATION) return GAP.NO_GAP; // split matches To-Be: harmonization gap not confirmed
  return null;
}

/** Completeness and mandatory-field check for one assessment. */
export function completeness(a) {
  const missing = [];
  if (a.scope.outOfScope || a.workshop.status === WORKSHOP_STATUS.OUT_OF_SCOPE) return { complete: true, outOfScope: true, missing, gap: effectiveGap(a) };
  const gap = effectiveGap(a);
  const touched = a.workshop.status !== WORKSHOP_STATUS.NOT_ASSESSED || !!a.workshop.changedAt;
  if (!fitGapComplete(a)) missing.push('Fit-Gap split (Local / Other / GBS)');
  const isGap = GAP_TYPES_WITH_DEVIATION.has(gap);
  const rationaleNeeded = (gap && gap !== GAP.NO_GAP) || gapDiffersFromOps(a);
  if (rationaleNeeded && !a.workshop.rationale?.trim()) missing.push('Rationale');
  if (isGap) {
    if (!detailedGapFilled(a).length) missing.push('At least one Detailed Gap field');
    const d = a.deviation || {};
    if (!d.dimensions?.length) missing.push('Deviation dimension');
    if (!d.resolution) missing.push('Resolution approach');
    if (!d.ownerId) missing.push('Accountable owner');
    if (d.resolution === RESOLUTION.SEPARATE_VARIANT && !d.justification?.trim()) missing.push('Justification (separate variant)');
  } else if (gap === GAP.NO_GAP || gap === GAP.NA) {
    // Detailed Gap optional – n/a allowed. Nothing to add.
  } else if (!gap) {
    missing.push('Workshop gap type');
  }
  if (a.workshop.status === WORKSHOP_STATUS.NOT_ASSESSED) missing.push('Workshop status');
  return { complete: missing.length === 0, outOfScope: false, missing, touched, gap, isGap };
}

/** "Confirm as fit": split from To-Be (if not set), Detailed Gap n/a, gap type NO GAP, status confirmed. */
export function confirmFit(session, key, process, meta = auditMeta(session)) {
  const a = session.assessments[key]; if (!a || a.scope.outOfScope) return false;
  let changed = false;
  if (!fitGapComplete(a)) {
    const tb = process?.toBe || {};
    const local = tb.le === true ? true : tb.le === false ? false : (a.asIs.le === true);
    const gbs = tb.gbs === true ? true : tb.gbs === false ? false : (a.asIs.gbs === true);
    changed = applyChange(session, key, 'fitGap.local', local, meta) || changed;
    changed = applyChange(session, key, 'fitGap.other', a.fitGap.other === true, meta) || changed;
    changed = applyChange(session, key, 'fitGap.gbs', gbs, meta) || changed;
  }
  for (const f of DETAILED_GAP_FIELDS) if (!a.detailedGap[f]) changed = applyChange(session, key, `detailedGap.${f}`, NA, meta) || changed;
  changed = applyChange(session, key, 'workshop.gapType', GAP.NO_GAP, meta) || changed;
  changed = applyChange(session, key, 'workshop.status', WORKSHOP_STATUS.CONFIRMED_FIT, meta) || changed;
  return changed;
}

/** Bulk: confirm every not-yet-assessed assessment with Ops NO GAP among the given keys. Returns { bulkId, count }. */
export function bulkConfirmNoGap(session, keys, processes, meta = auditMeta(session)) {
  const bulkId = newId('bulk'); let count = 0;
  for (const key of keys) {
    const a = session.assessments[key]; if (!a) continue;
    if (a.asIs.gap !== GAP.NO_GAP || a.scope.outOfScope || a.workshop.status !== WORKSHOP_STATUS.NOT_ASSESSED) continue;
    if (confirmFit(session, key, processes[a.processId], { ...meta, bulkId, note: 'bulk confirmation of Ops NO GAP' })) count++;
  }
  if (count) session.audit.push({ ts: new Date().toISOString(), key: 'bulk', field: 'bulk.confirmNoGap', old: null, new: count, sessionId: meta.sessionId ?? null, editor: meta.editor ?? '', bulkId });
  return { bulkId, count };
}

/** Undo every change of a bulk action by replaying the audit entries backwards. */
export function undoBulk(session, bulkId, meta = auditMeta(session)) {
  const entries = session.audit.filter(e => e.bulkId === bulkId && e.key !== 'bulk');
  let n = 0;
  for (const e of entries.slice().reverse()) { if (applyChange(session, e.key, e.field, e.old, { ...meta, bulkId: `undo:${bulkId}`, note: 'undo bulk confirmation' })) n++; }
  for (const key of new Set(entries.map(e => e.key))) { const a = session.assessments[key]; if (a && !session.audit.some(x => x.key === key && !x.bulkId)) a.workshop.changedAt = null; }
  return n;
}

export function copyDetailedGap(session, fromKey, toKey, meta = auditMeta(session)) {
  const src = session.assessments[fromKey]; if (!src) return 0; let n = 0;
  for (const f of DETAILED_GAP_FIELDS) if (src.detailedGap[f]) n += applyChange(session, toKey, `detailedGap.${f}`, src.detailedGap[f], meta) ? 1 : 0;
  return n;
}

/** Apply the Fit-Gap split, gap type, rationale, Detailed Gap and status of one entity's assessment to the other entities of the same activity. */
export function applyToAllEntities(session, fromKey, meta = auditMeta(session)) {
  const src = session.assessments[fromKey]; if (!src) return 0; let n = 0;
  for (const a of Object.values(session.assessments)) {
    if (a.processId !== src.processId || a.key === fromKey || a.scope.outOfScope) continue;
    for (const f of ['local', 'other', 'gbs', 'fte']) if (src.fitGap[f] !== null) n += applyChange(session, a.key, `fitGap.${f}`, src.fitGap[f], meta) ? 1 : 0;
    for (const f of DETAILED_GAP_FIELDS) if (src.detailedGap[f]) n += applyChange(session, a.key, `detailedGap.${f}`, src.detailedGap[f], meta) ? 1 : 0;
    for (const f of ['gapType', 'rationale', 'status']) if (src.workshop[f]) n += applyChange(session, a.key, `workshop.${f}`, src.workshop[f], meta) ? 1 : 0;
    if (src.deviation) n += applyChange(session, a.key, 'deviation', JSON.parse(JSON.stringify(src.deviation)), meta) ? 1 : 0;
  }
  return n;
}

/* ------------------------------------------------------------ tree & stats */

export function isMasterDataNode(p) { return /master\s*data/i.test(p.name || ''); }

/** Hierarchy of one stream (or all streams for MD): nodes with children, activities attached to their parent node. */
export function buildTree(session, stream, { masterDataOnly = false } = {}) {
  const all = Object.values(session.processes).filter(p => masterDataOnly ? true : p.stream === stream);
  const byId = Object.fromEntries(all.map(p => [p.id, { ...p, children: [], activities: [] }]));
  const roots = [];
  for (const n of Object.values(byId)) {
    const parent = n.parentId && byId[n.parentId];
    if (n.level >= 4) { if (parent) parent.activities.push(n); else roots.push(n); continue; }
    if (parent) parent.children.push(n); else roots.push(n);
  }
  const sortById = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true });
  for (const n of Object.values(byId)) { n.children.sort(sortById); n.activities.sort(sortById); }
  roots.sort(sortById);
  if (masterDataOnly) {
    // keep only sub-trees under a master-data node (any level 1–3)
    const keep = (n) => { if (isMasterDataNode(n)) return true; n.children = n.children.filter(keep); n.activities = isMasterDataNode(n) ? n.activities : []; return n.children.length > 0; };
    return roots.filter(keep);
  }
  return roots;
}

/** All activities below a node (depth-first, ID order). */
export function activitiesOf(node) { return [...node.activities, ...node.children.flatMap(activitiesOf)]; }

/** Stats for a set of activities: assessed / total (in scope), open gaps, per entity filter (null = all). */
export function nodeStats(session, activities, entityCode = null) {
  const s = { total: 0, assessed: 0, complete: 0, outOfScope: 0, openGaps: 0, opsNoGap: 0, ops: {} };
  for (const p of activities) for (const a of Object.values(session.assessments)) {
    if (a.processId !== p.id || (entityCode && a.entityCode !== entityCode)) continue;
    if (a.scope.outOfScope) { s.outOfScope++; continue; }
    s.total++;
    const g = a.asIs.gap || 'NOT_ASSESSED'; s.ops[g] = (s.ops[g] || 0) + 1;
    if (a.asIs.gap === GAP.NO_GAP && a.workshop.status === WORKSHOP_STATUS.NOT_ASSESSED) s.opsNoGap++;
    if (a.workshop.status !== WORKSHOP_STATUS.NOT_ASSESSED) s.assessed++;
    if (completeness(a).complete) s.complete++;
    if (GAP_TYPES_WITH_DEVIATION.has(effectiveGap(a)) && a.workshop.status !== WORKSHOP_STATUS.CONFIRMED_FIT) s.openGaps++;
  }
  return s;
}

/** Session timer figures for the active session. */
export function sessionPace(session, now = Date.now()) {
  const ws = session.sessions.find(s => s.id === session.activeSessionId); if (!ws) return null;
  const planned = ws.start && ws.end ? minutesBetween(ws.start, ws.end) : null;
  const started = ws.startedAt ? new Date(ws.startedAt).getTime() : null;
  const elapsed = started ? Math.max(0, Math.round((now - started) / 60000)) : 0;
  const streams = ws.stream === 'MD' ? null : [ws.stream.replace(/-.*$/, '')];
  let remaining = 0;
  for (const a of Object.values(session.assessments)) {
    if (a.scope.outOfScope || a.workshop.status !== WORKSHOP_STATUS.NOT_ASSESSED) continue;
    if (streams && !streams.includes(a.stream)) continue;
    if (ws.stream === 'MD' && !isMasterDataNode(session.processes[a.processId] || {})) continue;
    remaining++;
  }
  const left = planned !== null ? Math.max(0, planned - elapsed) : null;
  const secPer = left !== null && remaining ? Math.round(left * 60 / remaining) : null;
  return { session: ws, planned, elapsed, left, remaining, secPerActivity: secPer, running: !!started && !ws.endedAt };
}
export function minutesBetween(a, b) { const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number); return (h2 * 60 + m2) - (h1 * 60 + m1); }
