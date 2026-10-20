/* ---------------------------------------------------------------------------
 * 32-workshop.js – workshop logic on top of the session model: edits with
 * audit trail, completeness rules, suggestions, bulk confirm (+undo), node
 * progress and FTE impact, participants and workshop sessions, taxonomy
 * change requests. Pure functions, no DOM.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG || (root.FG = {});
  const U = FG.util, M = FG.model;

  const STATUS = {
    CONFIRMED_FIT: { label: 'Confirmed fit', key: '1', cls: 'ok' },
    CHANGED: { label: 'Changed vs. Ops', key: '2', cls: 'flag' },
    GAP: { label: 'Gap confirmed', key: '3', cls: 'warn' },
    OPEN_QUESTION: { label: 'Open question', key: '4', cls: 'info' },
    OUT_OF_SCOPE: { label: 'Out of scope', key: '5', cls: 'neutral' },
  };
  const RESOLUTION = { SEPARATE_VARIANT: 'Separate variant', CLOSE_BEFORE_GOLIVE: 'Close before go-live', LIFT_AND_SHIFT: 'Lift & shift' };
  const ESCALATION = { L1: 'L1 Transition Manager', L2: 'L2 QG Committee / Transition Lead', L3: 'L3 Project Leadership', STEERCO: 'SteerCo' };
  const APPROVAL = { PROPOSED: 'Proposed', ALIGNED: 'Aligned', APPROVED: 'Approved', REJECTED: 'Rejected' };
  const DIMENSIONS = ['Business', 'IT Systems', 'Legal'];
  const DG_FIELDS = [['itSystems', 'IT Systems'], ['workflowTools', 'Workflow Tools'], ['currentProcess', 'Current Process (country specifics)'], ['externalParty', 'External Party'], ['language', 'Language requirements'], ['legal', 'Legal / Regulatory'], ['controls', 'Internal Controls']];
  const GAP_IS_GAP = (g) => g === 'HARMONIZATION' || g === 'STANDARDIZATION' || g === 'BOTH';
  const ORG = ['Local', 'GBS Ops', 'Transition', 'Process Expert'];

  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj); }
  function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (const k of ks.slice(0, -1)) { if (o[k] === null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; } o[ks[ks.length - 1]] = v; }

  /** Set one workshop field with audit. path is relative to assessment.workshop, e.g. 'fitGap.local'. */
  function setField(session, key, path, value, opts) {
    const a = session.assessments[key]; if (!a) return false;
    const old = getPath(a.workshop, path);
    if (JSON.stringify(old === undefined ? null : old) === JSON.stringify(value === undefined ? null : value)) return false;
    setPath(a.workshop, path, value);
    a.workshop.changedAt = U.nowIso(); a.workshop.session = session.activeSessionId;
    M.logChange(session, { kind: (opts && opts.kind) || 'edit', entityKey: a.entityKey, processId: a.processId, field: 'workshop.' + path, old: old === undefined ? null : old, new: value });
    return true;
  }

  function splitOf(fg) { return { local: fg.local === 'Y', other: fg.other === 'Y', gbs: fg.gbs === 'Y' }; }
  function toBeSplit(p) { return { local: !!(p.toBe && p.toBe.le === 'Y'), other: false, gbs: !!(p.toBe && p.toBe.gbs === 'Y') }; }
  function splitLabel(s) { const parts = []; if (s.local) parts.push('Local'); if (s.other) parts.push('Other'); if (s.gbs) parts.push('GBS'); return parts.join(' + ') || '–'; }
  function fitGapSet(fg) { return fg.local !== null && fg.other !== null && fg.gbs !== null; }
  function sameSplit(a, b) { return a.local === b.local && a.other === b.other && a.gbs === b.gbs; }

  /** Suggestions for one assessment: confirm-as-fit availability, harmonization hint with delta text. */
  function suggest(a, p) {
    const w = a.workshop, fg = w.fitGap;
    const out = { confirmFit: false, harmonization: null, splitDelta: null };
    const tb = toBeSplit(p);
    if (fitGapSet(fg)) {
      const ws = splitOf(fg);
      if (!sameSplit(ws, tb)) { out.splitDelta = 'To-Be: ' + splitLabel(tb) + ' → Workshop: ' + splitLabel(ws); if (w.gapType !== 'HARMONIZATION' && w.gapType !== 'BOTH') out.harmonization = out.splitDelta; }
      else if ((a.asIs.gap === 'NO_GAP' || a.asIs.gap === null) && w.status !== 'CONFIRMED_FIT') out.confirmFit = true;
    } else if (a.asIs.gap === 'NO_GAP' && !w.status) out.confirmFit = true;
    return out;
  }

  /** Completeness per assessment. */
  function completeness(a, p) {
    const w = a.workshop, missing = [];
    if (a.importStatus === 'OUT_OF_SCOPE' && !w.status) return { done: true, outOfScope: true, missing: [], fitGapDone: true, detailedGapDone: true };
    if (w.status === 'OUT_OF_SCOPE') { if (!w.comment) missing.push('reason for out of scope (comment)'); return { done: !missing.length, outOfScope: true, missing, fitGapDone: true, detailedGapDone: true }; }
    const fitGapDone = fitGapSet(w.fitGap);
    if (!fitGapDone) missing.push('Fit-Gap split (Local / Other / GBS)');
    const g = w.gapType;
    if (!g) missing.push('workshop gap type');
    const needsRationale = g && (g !== 'NO_GAP' || (a.asIs.gap && g !== a.asIs.gap));
    if (needsRationale && !w.rationale) missing.push('rationale');
    const anyDg = DG_FIELDS.some(([k]) => w.detailedGap[k]);
    let detailedGapDone;
    if (GAP_IS_GAP(g)) { detailedGapDone = anyDg; if (!anyDg) missing.push('at least one Detailed Gap field'); }
    else detailedGapDone = w.detailedGap.na || anyDg || w.status === 'CONFIRMED_FIT';
    if (!detailedGapDone) missing.push('Detailed Gap (or n/a)');
    if (GAP_IS_GAP(g)) {
      const d = w.deviation || {};
      if (!d.resolution) missing.push('resolution approach');
      if (!d.owner) missing.push('accountable owner');
      if (d.resolution === 'SEPARATE_VARIANT' && !d.justification) missing.push('justification (separate variant)');
      if (!(d.dimensions && d.dimensions.length)) missing.push('dimension');
    }
    if (!w.status) missing.push('workshop status');
    void p;
    return { done: !missing.length, outOfScope: false, missing, fitGapDone, detailedGapDone };
  }

  /** Confirm as fit: split = To-Be, gap NO_GAP, detailed gap n/a, status confirmed. */
  function confirmFit(session, key, opts) {
    const a = session.assessments[key]; if (!a) return false;
    const p = session.processes[a.processId];
    const tb = toBeSplit(p);
    const kind = (opts && opts.kind) || 'edit';
    if (!fitGapSet(a.workshop.fitGap)) { setField(session, key, 'fitGap.local', tb.local ? 'Y' : 'N', { kind }); setField(session, key, 'fitGap.other', 'N', { kind }); setField(session, key, 'fitGap.gbs', tb.gbs ? 'Y' : 'N', { kind }); }
    setField(session, key, 'gapType', 'NO_GAP', { kind });
    if (!DG_FIELDS.some(([k]) => a.workshop.detailedGap[k])) setField(session, key, 'detailedGap.na', true, { kind });
    setField(session, key, 'status', 'CONFIRMED_FIT', { kind });
    return true;
  }

  /** Bulk: confirm every Ops NO GAP row under a node (all given entities) that has no workshop status yet. Returns undo info. */
  function bulkConfirm(session, nodeId, entityKeys) {
    const keys = [];
    for (const p of descendants(session, nodeId)) {
      if (!p.isActivity) continue;
      for (const ek of entityKeys) {
        const k = M.aKey(ek, p.id), a = session.assessments[k];
        if (!a || a.importStatus === 'OUT_OF_SCOPE' || a.workshop.status) continue;
        if (a.asIs.gap !== 'NO_GAP') continue;
        confirmFit(session, k, { kind: 'bulk' });
        keys.push(k);
      }
    }
    M.logChange(session, { kind: 'bulk', processId: nodeId, field: 'bulk-confirm', old: null, new: keys.length + ' assessments confirmed as fit (Ops NO GAP)', keys });
    return { keys };
  }
  function undoBulk(session, undo) {
    for (const k of undo.keys) { const a = session.assessments[k]; if (!a) continue; a.workshop = M.emptyWorkshop(); }
    M.logChange(session, { kind: 'bulk-undo', field: 'bulk-confirm', old: undo.keys.length + ' assessments', new: 'reverted', keys: undo.keys });
  }

  /** Copy workshop result of one entity to all other entities of the same activity. */
  function applyToAllEntities(session, key) {
    const src = session.assessments[key]; if (!src) return 0;
    let n = 0;
    for (const a of Object.values(session.assessments)) {
      if (a.processId !== src.processId || a.key === key || a.importStatus === 'OUT_OF_SCOPE') continue;
      const w = src.workshop;
      for (const f of ['local', 'other', 'gbs', 'fte']) setField(session, a.key, 'fitGap.' + f, w.fitGap[f], { kind: 'apply-all' });
      for (const f of ['gapType', 'rationale', 'status', 'comment']) setField(session, a.key, f, w[f], { kind: 'apply-all' });
      for (const [f] of DG_FIELDS) setField(session, a.key, 'detailedGap.' + f, w.detailedGap[f], { kind: 'apply-all' });
      setField(session, a.key, 'detailedGap.na', w.detailedGap.na, { kind: 'apply-all' });
      setField(session, a.key, 'deviation', w.deviation ? U.deepClone(w.deviation) : null, { kind: 'apply-all' });
      n++;
    }
    return n;
  }
  /** Copy Detailed Gap fields from the previous activity (same entity, same L3, by ID order). */
  function copyDetailedGapFromPrevious(session, key) {
    const a = session.assessments[key]; if (!a) return false;
    const p = session.processes[a.processId];
    const sibs = siblings(session, p).filter(x => x.id !== p.id && x.id.localeCompare(p.id, 'en', { numeric: true }) < 0);
    for (let i = sibs.length - 1; i >= 0; i--) {
      const prev = session.assessments[M.aKey(a.entityKey, sibs[i].id)];
      if (prev && (prev.workshop.detailedGap.na || DG_FIELDS.some(([k]) => prev.workshop.detailedGap[k]))) {
        for (const [f] of DG_FIELDS) setField(session, key, 'detailedGap.' + f, prev.workshop.detailedGap[f], { kind: 'copy-prev' });
        setField(session, key, 'detailedGap.na', prev.workshop.detailedGap.na, { kind: 'copy-prev' });
        return sibs[i].id;
      }
    }
    return false;
  }

  /* ---------- hierarchy helpers ------------------------------------------------- */
  function children(session, id) { return Object.values(session.processes).filter(p => p.parentId === id).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })); }
  function descendants(session, id) { const out = []; const walk = (x) => { for (const c of children(session, x)) { out.push(c); walk(c.id); } }; walk(id); return out; }
  function siblings(session, p) { return children(session, p.parentId).filter(x => x.isActivity); }
  function ancestors(session, p) { const out = []; let cur = p; while (cur && cur.parentId) { cur = session.processes[cur.parentId]; if (cur) out.push(cur); } return out; }

  /* ---------- progress & FTE ------------------------------------------------------- */
  function allocateFte(w, p) {
    const fte = w.fitGap.fte; if (fte === null || fte === undefined || isNaN(fte)) return null;
    let s = fitGapSet(w.fitGap) ? splitOf(w.fitGap) : null;
    if (!s || (!s.local && !s.other && !s.gbs)) s = toBeSplit(p);
    const n = (s.local ? 1 : 0) + (s.other ? 1 : 0) + (s.gbs ? 1 : 0) || 1;
    return { local: s.local ? fte / n : 0, other: s.other ? fte / n : 0, gbs: s.gbs ? fte / n : 0, total: fte, plannedGbs: toBeSplit(p).gbs ? fte : 0, plannedLocal: toBeSplit(p).local && !toBeSplit(p).gbs ? fte : 0 };
  }
  /** Progress + FTE impact for a node (or the whole stream when nodeId is a list of activities). */
  function progress(session, acts, entityKeys) {
    const r = { activities: acts.length, assessments: 0, outOfScope: 0, complete: 0, fitGapDone: 0, detailedGapDone: 0, openGaps: 0, openQuestions: 0, changed: 0, byStatus: {}, workshopMix: {}, opsMix: {}, fte: { total: 0, gbs: 0, local: 0, other: 0, plannedGbs: 0, withFte: 0 }, activitiesComplete: 0 };
    for (const p of acts) {
      let allDone = true, any = false;
      for (const ek of entityKeys) {
        const a = session.assessments[M.aKey(ek, p.id)]; if (!a) continue;
        if (a.importStatus === 'OUT_OF_SCOPE' && !a.workshop.status) { r.outOfScope++; continue; }
        if (a.workshop.status === 'OUT_OF_SCOPE') { r.outOfScope++; continue; }
        any = true; r.assessments++;
        const c = completeness(a, p);
        if (c.done) r.complete++; else allDone = false;
        if (c.fitGapDone) r.fitGapDone++;
        if (c.detailedGapDone) r.detailedGapDone++;
        const g = a.workshop.gapType || a.asIs.gap || 'EMPTY';
        r.workshopMix[g] = (r.workshopMix[g] || 0) + 1;
        const og = a.asIs.gap || 'EMPTY'; r.opsMix[og] = (r.opsMix[og] || 0) + 1;
        if (GAP_IS_GAP(a.workshop.gapType) && !(a.workshop.deviation && a.workshop.deviation.approval === 'APPROVED')) r.openGaps++;
        if (a.workshop.status) r.byStatus[a.workshop.status] = (r.byStatus[a.workshop.status] || 0) + 1;
        if (a.workshop.status === 'OPEN_QUESTION') r.openQuestions++;
        if (a.workshop.gapType && a.asIs.gap && a.workshop.gapType !== a.asIs.gap) r.changed++;
        const f = allocateFte(a.workshop, p);
        if (f) { r.fte.total += f.total; r.fte.gbs += f.gbs; r.fte.local += f.local; r.fte.other += f.other; r.fte.plannedGbs += f.plannedGbs; r.fte.withFte++; }
      }
      if (any && allDone) r.activitiesComplete++;
    }
    return r;
  }
  function nodeProgress(session, nodeId, entityKeys) { return progress(session, descendants(session, nodeId).filter(p => p.isActivity), entityKeys); }

  /* ---------- participants & workshop sessions -------------------------------------- */
  function addParticipant(session, p) { const x = { id: U.uid('p'), name: U.clean(p.name), role: U.clean(p.role || ''), organisation: p.organisation || 'Local', email: U.clean(p.email || '') }; session.participants.push(x); M.logChange(session, { kind: 'plan', field: 'participant.add', old: null, new: x.name }); return x; }
  function removeParticipant(session, id) { const p = session.participants.find(x => x.id === id); session.participants = session.participants.filter(x => x.id !== id); for (const s of session.sessions) s.participants = (s.participants || []).filter(x => x !== id); if (p) M.logChange(session, { kind: 'plan', field: 'participant.remove', old: p.name, new: null }); }
  function addSession(session, s) {
    const x = { id: U.uid('ws'), date: s.date || '', start: s.start || '', end: s.end || '', stream: s.stream || '', title: U.clean(s.title || ''), participants: s.participants || [], recording: U.clean(s.recording || ''), notes: U.clean(s.notes || ''), startedAt: null, endedAt: null, status: 'planned', source: s.source || 'manual', country: s.country || '' };
    session.sessions.push(x); session.sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    M.logChange(session, { kind: 'plan', field: 'session.add', old: null, new: x.date + ' ' + x.start + ' ' + x.stream }); return x;
  }
  function removeSession(session, id) { session.sessions = session.sessions.filter(x => x.id !== id); if (session.activeSessionId === id) session.activeSessionId = null; M.logChange(session, { kind: 'plan', field: 'session.remove', old: id, new: null }); }
  function startSession(session, id) { const s = session.sessions.find(x => x.id === id); if (!s) return; if (!s.startedAt) s.startedAt = U.nowIso(); s.status = 'running'; s.endedAt = null; session.activeSessionId = id; M.logChange(session, { kind: 'session', field: 'session.start', old: null, new: id }); }
  function endSession(session) { const s = session.sessions.find(x => x.id === session.activeSessionId); if (s) { s.endedAt = U.nowIso(); s.status = 'done'; M.logChange(session, { kind: 'session', field: 'session.end', old: s.id, new: null }); } session.activeSessionId = null; }
  function activeSession(session) { return session.sessions.find(x => x.id === session.activeSessionId) || null; }
  function sessionLabel(s) { return [s.date, s.start && s.end ? s.start + '–' + s.end : s.start, s.stream || s.title].filter(Boolean).join(' · '); }

  /** Timer facts for the active session: elapsed, planned, remaining activities, required pace. */
  function timer(session, now) {
    const s = activeSession(session); if (!s) return null;
    now = now || Date.now();
    const started = s.startedAt ? new Date(s.startedAt).getTime() : now;
    const elapsedS = Math.max(0, Math.round((now - started) / 1000));
    let plannedS = null, endMs = null;
    if (s.date && s.start && s.end) { const a = new Date(s.date + 'T' + s.start + ':00'), b = new Date(s.date + 'T' + s.end + ':00'); if (!isNaN(a) && !isNaN(b)) { plannedS = Math.max(0, (b - a) / 1000); endMs = b.getTime(); } }
    const ents = M.entityList(session).map(e => e.key);
    const acts = M.activities(session).filter(p => M.inScope(session, p) && (s.stream === 'MD' ? p.isMasterData : (!s.stream || M.streamKey(p) === s.stream || p.stream === s.stream)));
    const pr = progress(session, acts, ents);
    const inScopeActs = acts.filter(p => ents.some(ek => { const a = session.assessments[M.aKey(ek, p.id)]; return a && a.importStatus !== 'OUT_OF_SCOPE'; }));
    const remaining = Math.max(0, inScopeActs.length - pr.activitiesComplete);
    const leftS = endMs ? Math.max(0, Math.round((endMs - now) / 1000)) : (plannedS !== null ? Math.max(0, plannedS - elapsedS) : null);
    return { session: s, elapsedS, plannedS, leftS, activities: inScopeActs.length, done: pr.activitiesComplete, remaining, paceS: leftS !== null && leftS > 0 && remaining ? Math.round(leftS / remaining) : null, overdue: leftS === 0 && plannedS !== null };
  }

  function addTaxonomyRequest(session, r) { const x = { id: U.uid('tx'), ts: U.nowIso(), processId: r.processId, entityKey: r.entityKey || null, change: U.clean(r.change), reason: U.clean(r.reason), session: session.activeSessionId, editor: session.settings.editorInitials || null }; session.taxonomyRequests.push(x); M.logChange(session, { kind: 'taxonomy', processId: r.processId, field: 'taxonomyRequest', old: null, new: x.change }); return x; }

  /** Frequently used values per Detailed Gap field (from Ops systems + entered values) for quick-pick chips. */
  function quickValues(session) {
    const counts = {}; for (const [k] of DG_FIELDS) counts[k] = {};
    const add = (k, v) => { if (!v) return; for (const part of String(v).split(/\s*[\/,;]\s*/)) { const t = U.clean(part); if (t && t.length <= 30) counts[k][t] = (counts[k][t] || 0) + 1; } };
    for (const a of Object.values(session.assessments)) { add('itSystems', a.asIs.systems); for (const [k] of DG_FIELDS) add(k, a.workshop.detailedGap[k]); }
    for (const p of Object.values(session.processes)) if (p.toBe) add('itSystems', p.toBe.system);
    const out = {}; for (const k in counts) out[k] = Object.entries(counts[k]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
    return out;
  }
  function initiatives(session) { const set = new Map(); for (const p of Object.values(session.processes)) if (p.toBe && p.toBe.initiative) set.set(p.toBe.initiative, (set.get(p.toBe.initiative) || 0) + 1); return Array.from(set.keys()).sort(); }

  FG.workshop = { STATUS, RESOLUTION, ESCALATION, APPROVAL, DIMENSIONS, DG_FIELDS, ORG, GAP_IS_GAP, setField, suggest, completeness, confirmFit, bulkConfirm, undoBulk, applyToAllEntities, copyDetailedGapFromPrevious, children, descendants, siblings, ancestors, progress, nodeProgress, allocateFte, splitOf, toBeSplit, splitLabel, addParticipant, removeParticipant, addSession, removeSession, startSession, endSession, activeSession, sessionLabel, timer, addTaxonomyRequest, quickValues, initiatives };
})(typeof globalThis !== 'undefined' ? globalThis : window);
