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
      clientName: '', country: '', workshopDates: [], facilitators: [], logoDataUrl: null, logoOnDark: false, logoSource: '', brandColor: '',
      streamsInScope: { R2R: true, 'A2R-FAA': true, 'A2R-IA': true, I2P: true, I2C: true, ICO: true, MD: true },
      gapDefinitions: { ...GAP_DEFINITIONS },
      minutesPerActivity: { NO_GAP: 1.5, GAP: 5 },
      effortUnit: 'hours',          // 'hours' (hours per month, FTE derived) | 'fte'
      hoursPerFteMonth: 140,        // productive hours per FTE per month (≈ 1,680 a year)
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
/** "…_Assessment__A2R_France.xlsx" → "France" (the trailing token when it is not a stream / version / date). */
// ISO-3166 alpha-2 codes as they appear at the end of capture-sheet file names ("…_R2R_KR.xlsx").
const COUNTRY_CODES = { AR: 'Argentina', AT: 'Austria', AU: 'Australia', BE: 'Belgium', BG: 'Bulgaria', BR: 'Brazil', CA: 'Canada', CH: 'Switzerland', CL: 'Chile', CN: 'China', CO: 'Colombia', CZ: 'Czech Republic', DE: 'Germany', DK: 'Denmark', EG: 'Egypt', ES: 'Spain', FI: 'Finland', FR: 'France', GB: 'United Kingdom', GR: 'Greece', HK: 'Hong Kong', HR: 'Croatia', HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IL: 'Israel', IN: 'India', IT: 'Italy', JP: 'Japan', KR: 'Korea', MX: 'Mexico', MY: 'Malaysia', NL: 'Netherlands', NO: 'Norway', NZ: 'New Zealand', PH: 'Philippines', PL: 'Poland', PT: 'Portugal', RO: 'Romania', RS: 'Serbia', RU: 'Russia', SA: 'Saudi Arabia', SE: 'Sweden', SG: 'Singapore', SI: 'Slovenia', SK: 'Slovakia', TH: 'Thailand', TR: 'Turkey', TW: 'Taiwan', UA: 'Ukraine', UK: 'United Kingdom', US: 'United States', VN: 'Vietnam', ZA: 'South Africa' };
export function countryFromFileName(fileName = '') {
  const base = String(fileName).replace(/\.[a-z]+$/i, '');
  const iso = base.match(/[_\- ]([A-Z]{2})$/); if (iso && COUNTRY_CODES[iso[1]]) return COUNTRY_CODES[iso[1]];
  const m = base.match(/[_\- ]([A-Za-z][A-Za-z ]{2,30})$/);
  if (!m) return '';
  const tok = m[1].trim();
  if (/^(A2R|R2R|I2P|I2C|ICO|O2C|P2P|H2R|MD|FAA|IA|CMD|CM|FINAL|DRAFT|NEW|OLD|VOLD|TEMPLATE|TEMP|COPY|VERSION|FIT|GAP|ASSESSMENT)$/i.test(tok)) return '';
  return tok.charAt(0).toUpperCase() + tok.slice(1);
}

/** "Alpha Pharma France S.A.S.", "Alpha Logistics S.A.S.", "Beta France S.A.S." → "Alpha" (the first word most entities share). */
export function clientNameFromEntities(names) {
  const firsts = names.map(n => (String(n).trim().match(/^[\p{L}][\p{L}\d&'-]{2,}/u) || [''])[0]).filter(Boolean);
  if (!firsts.length) return '';
  const count = {}; for (const w of firsts) count[w.toLowerCase()] = (count[w.toLowerCase()] || 0) + 1;
  const [best, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  if (firsts.length > 1 && (n < 2 || n * 2 < firsts.length)) return '';
  return firsts.find(w => w.toLowerCase() === best);
}

/** Move every assessment (and its audit entries) of one entity code to another. */
export function rekeyEntity(session, from, to) {
  for (const a of Object.values(session.assessments)) {
    if (a.entityCode !== from) continue;
    const oldKey = a.key; a.entityCode = to; a.key = assessmentKey(to, a.processId);
    delete session.assessments[oldKey];
    if (session.assessments[a.key]) { const ex = session.assessments[a.key]; for (const s of a.sources) if (!ex.sources.some(x => x.file === s.file && x.row === s.row)) ex.sources.push(s); }
    else session.assessments[a.key] = a;
    for (const e of session.audit) if (e.key === oldKey) e.key = a.key;
  }
  for (const p of session.participants || []) if (p.entityCode === from) p.entityCode = to;
}

export function mergeParsedWorkbook(session, parsed, opts = {}) {
  const now = new Date().toISOString();
  const report = { file: parsed.fileName, sheet: parsed.sheetName, entities: { added: [], merged: [], pending: [] }, processes: { added: 0, existing: 0, renamed: [] }, assessments: { added: 0, merged: 0, changedOps: 0, protectedWorkshop: 0 }, warnings: parsed.warnings.slice() };
  const codeMap = {}; // parsed entity code → session entity code

  const fileCountry = countryFromFileName(parsed.fileName) || session.settings.country || '';
  const sameCountry = () => Object.values(session.entities).filter(x => !fileCountry || !x.country || x.country === fileCountry);
  for (const e of parsed.entities) {
    let target = null;
    if (e.unlabeled) {
      // Single-entity file without label: the one entity of this country, else a placeholder the labelled file takes over.
      const real = sameCountry().filter(x => !x.placeholder), ph = sameCountry().filter(x => x.placeholder);
      const coded = real.filter(x => x.hasCode);
      if (real.length === 1) { target = real[0]; report.entities.merged.push({ from: '(no label)', to: target.name, auto: true, reason: 'single-entity file' }); }
      else if (coded.length === 1) { target = coded[0]; report.entities.merged.push({ from: '(no label)', to: target.name, auto: true, reason: 'only entity of this country with a code' }); report.warnings.push({ level: 'info', code: 'ENTITY_BY_CODE', message: `${parsed.fileName} has no entity label – assigned to ${target.code} ${target.name}, the only entity of ${fileCountry || 'this country'} with an entity code.` }); }
      else if (ph.length) target = ph[0];
      else {
        const code = `unlabeled:${fuzzyKey(fileCountry || 'entity')}`;
        target = session.entities[code] = { code, name: `${fileCountry || 'Entity'} (no entity label)`, displayName: `${fileCountry || 'Entity'} (no entity label)`, country: fileCountry, hasCode: false, placeholder: true, sources: [] };
        report.entities.added.push(target.name);
        if (real.length > 1) report.warnings.push({ level: 'warn', code: 'ENTITY_AMBIGUOUS', message: `${parsed.fileName} has no entity label and ${fileCountry || 'this country'} has ${real.length} entities – imported under "${target.name}". Add the entity label in the file and re-import.` });
      }
      if (!target.sources.includes(parsed.fileName)) target.sources.push(parsed.fileName);
      codeMap[e.code] = target.code; continue;
    }
    if (e.hasCode && session.entities[e.code]) target = session.entities[e.code];
    // A labelled file for a country that so far only had unlabelled files: the placeholder becomes this entity.
    if (!target && e.hasCode) {
      const ph = sameCountry().filter(x => x.placeholder), real = sameCountry().filter(x => !x.placeholder);
      if (ph.length === 1 && real.length === 0) { const fresh = { code: e.code, name: e.name, displayName: e.name, country: ph[0].country || fileCountry, hasCode: true, sources: [...ph[0].sources] }; session.entities[e.code] = fresh; rekeyEntity(session, ph[0].code, e.code); delete session.entities[ph[0].code]; target = fresh; report.entities.merged.push({ from: ph[0].name, to: e.name, auto: true, reason: 'label found in this file' }); }
    }
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
      target = { code: e.code, name: e.name, displayName: e.name, country: fileCountry, hasCode: e.hasCode, sources: [] };
      session.entities[e.code] = target;
      report.entities.added.push(e.name);
    }
    if (!target.sources.includes(parsed.fileName)) target.sources.push(parsed.fileName);
    codeMap[e.code] = target.code;
  }
  // Client and country from the files when nobody typed them yet (editable under Plan & prepare).
  if (!session.settings.country) session.settings.country = countryFromFileName(parsed.fileName);
  if (!session.settings.clientName) session.settings.clientName = clientNameFromEntities(Object.values(session.entities).filter(x => !x.placeholder).map(x => x.name));

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
