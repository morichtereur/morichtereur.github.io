// Session model: the single in-memory state that is autosaved (IndexedDB) and
// exported as JSON. Import/merge rules live here so the parser stays pure.
import { SESSION_FILE_VERSION, GAP_DEFINITIONS } from './constants.js';
import { fuzzyKey, similarity, assessmentKey, normText } from './normalize.js';

export function newId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createSession() {
  return {
    version: SESSION_FILE_VERSION,
    id: newId('ses'),
    createdAt: new Date().toISOString(),
    updatedAt: null,
    settings: {
      clientName: '', country: '', workshopDates: [], facilitators: [], logoDataUrl: null,
      streamsInScope: { R2R: true, 'A2R-FAA': true, 'A2R-IA': true, I2P: true, I2C: true, ICO: true, MD: true },
      gapDefinitions: { ...GAP_DEFINITIONS },
      minutesPerActivity: { NO_GAP: 1.5, GAP: 5 },
      editorInitials: '',
      lunch: { start: '12:00', end: '13:00' },
      dayStart: '08:00', dayEnd: '18:00',
    },
    entities: {},        // code → { code, name, displayName, country, hasCode, sources[] }
    processes: {},       // id → Process (+ sources[])
    assessments: {},     // key → Assessment
    files: [],           // import records
    participants: [],    // { id, name, role, organisation }
    sessions: [],        // { id, date, start, end, stream, participantIds[], recording, note }
    activeSessionId: null,
    audit: [],           // { ts, key, field, old, new, sessionId, editor, bulkId? }
    feedback: [],        // { ts, view, note, sessionId }
    taxonomyChangeRequests: [],
    pendingEntityMatches: [],
    importDiffs: [],     // Ops pre-assessment values changed by a re-import, for review
    flows: [],           // { id, file, sheet, row, label, labelId, nodeId, score, stream, dataUrl, mime }
    signoff: {},         // stream → { pe: { name, date }, ops: { name, date } }
    profiles: [],        // custom template profiles (serialisable)
    portfolio: [],       // planning workbook rows: { country, process, stream, responsible, dateRaw, timeRaw, status, comment }
    milestones: DEFAULT_MILESTONES.map(m => ({ ...m })),
  };
}

export const DEFAULT_MILESTONES = [
  { key: 'start', label: 'Transition start', date: '' }, { key: 'qg1', label: 'QG1', date: '' }, { key: 'workshops', label: 'Fit-gap workshops', date: '' },
  { key: 'evaluate', label: 'Evaluate & decide', date: '' }, { key: 'qg2', label: 'QG2 fit-gap conclusion', date: '' }, { key: 'kt', label: 'KT kick-off', date: '' },
  { key: 'qg3', label: 'QG3 go-live', date: '' }, { key: 'qg4', label: 'QG4 closure', date: '' },
];

const AS_IS_FIELDS = ['le', 'gbs', 'systems', 'gap', 'gapRaw', 'info'];

function sameValue(a, b) { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }

/**
 * Merge one parsed workbook into the session. Returns a report.
 * Rules: one assessment per entity × Process ID; entities merge by code (fuzzy
 * by name when no code); workshop results are never overwritten; changed Ops
 * values are applied and recorded in importDiffs for review.
 */
export function mergeParsedWorkbook(session, parsed, opts = {}) {
  const now = new Date().toISOString();
  const report = { file: parsed.fileName, sheet: parsed.sheetName, entities: { added: [], merged: [], pending: [] }, processes: { added: 0, existing: 0, renamed: [] }, assessments: { added: 0, merged: 0, changedOps: 0, protectedWorkshop: 0 }, warnings: parsed.warnings.slice() };
  const codeMap = {}; // parsed entity code → session entity code

  for (const e of parsed.entities) {
    let target = null;
    if (e.hasCode && session.entities[e.code]) target = session.entities[e.code];
    else if (!e.hasCode) {
      let best = null;
      for (const s of Object.values(session.entities)) {
        const sc = similarity(e.name, s.name);
        if (!best || sc > best.score) best = { entity: s, score: sc };
      }
      if (best && best.score >= (opts.autoMatchThreshold ?? 0.85)) { target = best.entity; report.entities.merged.push({ from: e.name, to: target.name, score: best.score, auto: true }); }
      else if (best && best.score >= 0.6) {
        session.pendingEntityMatches.push({ id: newId('pem'), file: parsed.fileName, imported: e, candidate: best.entity.code, score: best.score });
        report.entities.pending.push({ from: e.name, candidate: best.entity.name, score: best.score });
      }
    }
    if (!target) {
      target = { code: e.code, name: e.name, displayName: e.name, country: session.settings.country || '', hasCode: e.hasCode, sources: [] };
      session.entities[e.code] = target;
      report.entities.added.push(e.name);
    }
    if (!target.sources.includes(parsed.fileName)) target.sources.push(parsed.fileName);
    codeMap[e.code] = target.code;
  }

  for (const p of parsed.processes) {
    const ex = session.processes[p.id];
    if (!ex) {
      session.processes[p.id] = { ...p, sources: [{ file: parsed.fileName, sheet: parsed.sheetName, row: p.row }] };
      delete session.processes[p.id].row;
      report.processes.added++;
    } else {
      report.processes.existing++;
      if (normText(ex.name) !== normText(p.name)) report.processes.renamed.push({ id: p.id, old: ex.name, new: p.name });
      if (!ex.sources.some(s => s.file === parsed.fileName)) ex.sources.push({ file: parsed.fileName, sheet: parsed.sheetName, row: p.row });
      if (p.toBe) { ex.toBe = ex.toBe || {}; for (const [k, v] of Object.entries(p.toBe)) if (v !== null && v !== '' && (ex.toBe[k] === null || ex.toBe[k] === undefined || ex.toBe[k] === '')) ex.toBe[k] = v; }
    }
  }

  for (const a of parsed.assessments) {
    const code = codeMap[a.entityCode] || a.entityCode;
    const key = assessmentKey(code, a.processId);
    const ex = session.assessments[key];
    if (!ex) { session.assessments[key] = { ...a, entityCode: code, key }; report.assessments.added++; continue; }
    report.assessments.merged++;
    if (!ex.sources.some(s => s.file === parsed.fileName)) ex.sources.push(a.sources[0]);
    // Ops pre-assessment: apply new values, record the diff.
    for (const f of AS_IS_FIELDS) {
      if (f === 'gapRaw') continue;
      if (!sameValue(ex.asIs[f], a.asIs[f])) {
        session.importDiffs.push({ id: newId('diff'), ts: now, key, entityCode: code, processId: a.processId, field: `asIs.${f}`, old: ex.asIs[f], new: a.asIs[f], file: parsed.fileName });
        ex.asIs[f] = a.asIs[f]; if (f === 'gap') ex.asIs.gapRaw = a.asIs.gapRaw;
        report.assessments.changedOps++;
      }
    }
    const touched = !!ex.workshop.changedAt;
    if (touched) { report.assessments.protectedWorkshop++; continue; }
    // Untouched in the workshop: imported Fit-Gap / Detailed Gap values and scope may be refreshed.
    ex.fitGap = a.fitGap; ex.detailedGap = a.detailedGap; ex.scope = a.scope; ex.notes = a.notes; ex.workshop.status = a.workshop.status;
  }

  session.files = session.files.filter(f => f.name !== parsed.fileName);
  session.files.push({ name: parsed.fileName, sheet: parsed.sheetName, profileId: parsed.profileId, importedAt: now, entities: parsed.entities.map(e => codeMap[e.code] || e.code), streams: Object.keys(parsed.summary.streams), activities: parsed.summary.activities, flowSheets: parsed.flowSheets, layout: { headerRow: parsed.layout.headerRow + 1, blocks: parsed.layout.blocks.map(b => ({ kind: b.kind, entity: b.entity?.name || null, cols: `${colLetterLocal(b.col)}–${colLetterLocal(b.colEnd)}`, fields: Object.fromEntries(Object.entries(b.headers).map(([f, h]) => [f, h.cell])) })) }, warnings: parsed.warnings });
  session.audit.push({ ts: now, key: `file:${parsed.fileName}`, field: 'import', old: null, new: `${parsed.sheetName}: +${report.assessments.added} / ${report.assessments.merged} merged, ${report.assessments.changedOps} Ops values changed`, sessionId: session.activeSessionId, editor: session.settings.editorInitials });
  session.updatedAt = now;
  return report;
}

function colLetterLocal(c) { let s = ''; c = c + 1; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }

/** Resolve a pending entity match: merge the imported (code-less) entity into the candidate, or keep it separate. */
export function resolvePendingEntity(session, pendingId, merge) {
  const idx = session.pendingEntityMatches.findIndex(p => p.id === pendingId);
  if (idx < 0) return;
  const p = session.pendingEntityMatches[idx];
  session.pendingEntityMatches.splice(idx, 1);
  if (!merge) return;
  const from = p.imported.code, to = p.candidate;
  const target = session.entities[to];
  const source = session.entities[from];
  if (!target || !source || from === to) return;
  for (const f of source.sources) if (!target.sources.includes(f)) target.sources.push(f);
  delete session.entities[from];
  for (const [key, a] of Object.entries(session.assessments)) {
    if (a.entityCode !== from) continue;
    const newKey = assessmentKey(to, a.processId);
    const ex = session.assessments[newKey];
    if (ex) { for (const s of a.sources) if (!ex.sources.some(x => x.file === s.file)) ex.sources.push(s); }
    else session.assessments[newKey] = { ...a, entityCode: to, key: newKey };
    delete session.assessments[key];
  }
  for (const f of session.files) f.entities = f.entities.map(c => c === from ? to : c);
  session.audit.push({ ts: new Date().toISOString(), key: `entity:${from}`, field: 'merge', old: from, new: to, sessionId: session.activeSessionId, editor: session.settings.editorInitials });
}

/** Import summary across the whole session: entities × streams matrix, counts, gap distribution. */
export function importSummary(session) {
  const entities = Object.values(session.entities);
  const streams = [...new Set(Object.values(session.processes).map(p => p.stream))].filter(Boolean).sort();
  const matrix = {}; const gapByStream = {}; const activitiesByStream = {}; let outOfScope = 0;
  for (const s of streams) { gapByStream[s] = {}; activitiesByStream[s] = 0; }
  for (const p of Object.values(session.processes)) if (p.level >= 4) activitiesByStream[p.stream] = (activitiesByStream[p.stream] || 0) + 1;
  for (const a of Object.values(session.assessments)) {
    matrix[a.entityCode] = matrix[a.entityCode] || {};
    matrix[a.entityCode][a.stream] = (matrix[a.entityCode][a.stream] || 0) + 1;
    if (a.scope.outOfScope) { outOfScope++; continue; }
    const g = a.asIs.gap || 'NOT_ASSESSED';
    gapByStream[a.stream] = gapByStream[a.stream] || {};
    gapByStream[a.stream][g] = (gapByStream[a.stream][g] || 0) + 1;
  }
  return { files: session.files, entities, streams, matrix, activitiesByStream, gapByStream, outOfScope, assessments: Object.keys(session.assessments).length, warnings: session.files.flatMap(f => f.warnings.map(w => ({ file: f.name, ...w }))), pendingEntityMatches: session.pendingEntityMatches, importDiffs: session.importDiffs };
}

/** JSON (de)serialisation with a version gate for future migrations. */
export function serializeSession(session) { return JSON.stringify(session); }
export function deserializeSession(text) {
  const s = JSON.parse(text);
  if (typeof s.version !== 'number' || s.version > SESSION_FILE_VERSION) throw new Error(`Unsupported session file version ${s.version}`);
  const base = createSession();
  return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}), minutesPerActivity: { ...base.settings.minutesPerActivity, ...(s.settings?.minutesPerActivity || {}) }, streamsInScope: { ...base.settings.streamsInScope, ...(s.settings?.streamsInScope || {}) }, gapDefinitions: { ...base.settings.gapDefinitions, ...(s.settings?.gapDefinitions || {}) } } };
}
