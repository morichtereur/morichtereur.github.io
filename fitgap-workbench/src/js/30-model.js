/* ---------------------------------------------------------------------------
 * 30-model.js – session data model: merge parsed files into ONE model,
 * re-import diffs, audit trail, feedback log. Pure functions over a plain
 * JSON-serialisable session object (so IndexedDB / JSON save is trivial and
 * the Replit port can reuse it unchanged).
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG || (root.FG = {});
  const U = FG.util;

  const SESSION_VERSION = 1;

  function createSession() {
    return {
      kind: 'fitgap-workbench-session', version: SESSION_VERSION,
      id: U.uid('s'), createdAt: U.nowIso(), updatedAt: U.nowIso(),
      profileId: 'profile-1',
      settings: {
        clientName: '', country: '', workshopDates: '', facilitators: '', logoDataUrl: null,
        editorInitials: '', theme: 'light', screenShare: false,
        streamScope: {}, // stream/sub-stream key -> true/false (default true)
        gapDefinitions: U.deepClone(FG.GAP_DEFINITIONS_DEFAULT),
      },
      files: [],        // import log, one entry per file (latest version)
      entities: {},     // key -> Entity
      processes: {},    // id -> Process
      assessments: {},  // entityKey|processId -> Assessment
      participants: [], // {id, name, role, organisation}
      sessions: [],     // workshop sessions {id, date, start, end, stream, participants:[], recording}
      activeSessionId: null,
      pendingDiffs: [], // re-import diffs awaiting review
      audit: [],        // {ts, kind, entityKey, processId, field, old, new, session, editor}
      feedback: [],     // {ts, view, note, session}
      taxonomyRequests: [],
    };
  }

  const aKey = (entityKey, processId) => entityKey + '|' + processId;

  function emptyWorkshop() {
    return {
      status: null,            // CONFIRMED_FIT | CHANGED | GAP | OPEN_QUESTION | OUT_OF_SCOPE
      gapType: null, rationale: null,
      fitGap: { local: null, other: null, gbs: null, fte: null },
      detailedGap: { itSystems: null, workflowTools: null, currentProcess: null, externalParty: null, language: null, legal: null, controls: null, na: false },
      deviation: null,         // {dimensions:[], resolution, justification, owner, targetDate, escalation, approval}
      comment: null, nextStep: null, owner: null, due: null,
      changedAt: null, session: null,
    };
  }

  /**
   * Merge a parser result into the session. Returns a summary
   * { added:{entities,processes,assessments}, updated:{processes}, diffs:[...] }.
   * Never touches workshop results. Re-imports of the same file replace the
   * file entry; changed Ops pre-assessment values go to session.pendingDiffs.
   */
  function mergeImport(session, parsed, opts) {
    opts = opts || {};
    const now = U.nowIso();
    const summary = { file: parsed.fileName, added: { entities: 0, processes: 0, assessments: 0 }, updated: { processes: 0 }, diffs: [], unchanged: 0 };
    const isReimport = session.files.some(f => f.name === parsed.fileName);

    for (const e of parsed.entities) {
      const k = e.key || e.code || ('name:' + U.key(e.name));
      if (!session.entities[k]) {
        session.entities[k] = { key: k, code: e.code, name: e.name, displayName: e.name, country: session.settings.country || '', sources: [parsed.fileName], needsConfirmation: !!e.needsConfirmation };
        summary.added.entities++;
      } else if (!session.entities[k].sources.includes(parsed.fileName)) session.entities[k].sources.push(parsed.fileName);
    }
    for (const p of parsed.processes) {
      const ex = session.processes[p.id];
      if (!ex) {
        session.processes[p.id] = { ...U.deepClone(p), sources: [parsed.fileName] };
        summary.added.processes++;
        continue;
      }
      if (!ex.sources.includes(parsed.fileName)) ex.sources.push(parsed.fileName);
      let changed = false;
      for (const f of ['name', 'description', 'level', 'parentId', 'subStream', 'isMasterData']) {
        if (p[f] !== undefined && JSON.stringify(ex[f]) !== JSON.stringify(p[f])) {
          if (f === 'name' || f === 'description') summary.diffs.push({ kind: 'process', processId: p.id, field: f, old: ex[f], new: p[f], file: parsed.fileName });
          ex[f] = p[f]; changed = true;
        }
      }
      if (p.toBe && JSON.stringify(ex.toBe) !== JSON.stringify(p.toBe)) {
        for (const f in p.toBe) if ((ex.toBe || {})[f] !== p.toBe[f]) summary.diffs.push({ kind: 'toBe', processId: p.id, field: f, old: (ex.toBe || {})[f], new: p.toBe[f], file: parsed.fileName });
        ex.toBe = { ...(ex.toBe || {}), ...p.toBe }; changed = true;
      }
      if (p.context && Object.keys(p.context).length) { ex.context = { ...(ex.context || {}), ...p.context }; }
      if (changed) summary.updated.processes++;
    }
    for (const a of parsed.assessments) {
      const k = aKey(a.entityKey, a.processId);
      const ex = session.assessments[k];
      if (!ex) {
        session.assessments[k] = {
          key: k, entityKey: a.entityKey, processId: a.processId,
          asIs: { ...a.asIs }, fitGapPreset: { ...a.fitGap }, detailedGapPreset: { ...a.detailedGap },
          importStatus: a.status, importStatusReason: a.statusReason,
          workshop: emptyWorkshop(), sources: [parsed.fileName], importedAt: now,
        };
        if (a.status === 'OUT_OF_SCOPE') session.assessments[k].workshop.status = 'OUT_OF_SCOPE';
        summary.added.assessments++;
        continue;
      }
      if (!ex.sources.includes(parsed.fileName)) ex.sources.push(parsed.fileName);
      // compare Ops pre-assessment (as-is) – never overwrite, queue a diff
      let same = true;
      const fields = new Set(Object.keys(ex.asIs).concat(Object.keys(a.asIs)));
      for (const f of fields) {
        if (f === 'gapRaw') continue;
        const o = ex.asIs[f] === undefined ? null : ex.asIs[f], n = a.asIs[f] === undefined ? null : a.asIs[f];
        if (o !== n) { same = false; summary.diffs.push({ kind: 'asIs', key: k, entityKey: a.entityKey, processId: a.processId, field: f, old: o, new: n, file: parsed.fileName }); }
      }
      if ((ex.importStatus || null) !== (a.status || null)) { same = false; summary.diffs.push({ kind: 'importStatus', key: k, entityKey: a.entityKey, processId: a.processId, field: 'status', old: ex.importStatus || null, new: a.status || null, file: parsed.fileName }); }
      if (same) summary.unchanged++;
    }
    // file log
    const fileEntry = {
      id: U.uid('f'), name: parsed.fileName, sheetName: parsed.sheetName, importedAt: now, profileId: parsed.profileId,
      structure: parsed.structure, stats: parsed.stats, warnings: parsed.warnings, notes: parsed.notes, unmapped: parsed.unmapped,
      version: 1,
    };
    const idx = session.files.findIndex(f => f.name === parsed.fileName);
    if (idx >= 0) { fileEntry.version = (session.files[idx].version || 1) + 1; session.files[idx] = fileEntry; }
    else session.files.push(fileEntry);
    // notes → process notes (instruction text found in the file)
    for (const n of parsed.notes) {
      const p = session.processes[n.processId];
      if (!p) continue;
      p.notes = p.notes || [];
      const sig = n.entityKey + '|' + n.block + '|' + n.field + '|' + n.text;
      if (!p.notes.some(x => x.sig === sig)) p.notes.push({ sig, ...n, file: parsed.fileName });
    }
    // queue diffs for review (only for re-imports; first import of overlapping files normally has no diffs)
    const reviewable = summary.diffs.filter(d => d.kind === 'asIs' || d.kind === 'importStatus');
    for (const d of reviewable) session.pendingDiffs.push({ id: U.uid('d'), ...d, status: 'pending' });
    session.audit.push({ ts: now, kind: isReimport ? 'reimport' : 'import', file: parsed.fileName, summary: { ...summary, diffs: summary.diffs.length }, session: session.activeSessionId, editor: session.settings.editorInitials || null });
    session.updatedAt = now;
    summary.isReimport = isReimport;
    return summary;
  }

  /** Apply (or dismiss) a pending diff. Applying changes the Ops as-is value and logs it. */
  function resolveDiff(session, diffId, apply) {
    const d = session.pendingDiffs.find(x => x.id === diffId);
    if (!d) return false;
    if (apply) {
      const a = session.assessments[d.key];
      if (a) {
        if (d.kind === 'asIs') a.asIs[d.field] = d.new;
        else if (d.kind === 'importStatus') { a.importStatus = d.new; }
        logChange(session, { kind: 'reimport-apply', entityKey: d.entityKey, processId: d.processId, field: d.kind + '.' + d.field, old: d.old, new: d.new });
      }
    }
    d.status = apply ? 'applied' : 'kept';
    d.resolvedAt = U.nowIso();
    session.pendingDiffs = session.pendingDiffs.filter(x => x.status === 'pending');
    return true;
  }

  function logChange(session, ch) {
    session.audit.push({ ts: U.nowIso(), session: session.activeSessionId, editor: session.settings.editorInitials || null, ...ch });
    session.updatedAt = U.nowIso();
  }
  function addFeedback(session, view, note) {
    const f = { id: U.uid('fb'), ts: U.nowIso(), view, note, session: session.activeSessionId };
    session.feedback.push(f); session.updatedAt = f.ts; return f;
  }

  /* ---------- derived views ------------------------------------------------ */
  function entityList(session) { return Object.values(session.entities).sort((a, b) => (a.code || '').localeCompare(b.code || '') || a.name.localeCompare(b.name)); }
  function processList(session) { return Object.values(session.processes); }
  function activities(session) { return processList(session).filter(p => p.isActivity); }
  function streamKey(p) { return p.subStream || p.stream; }
  function inScope(session, p) { const k = streamKey(p); return session.settings.streamScope[k] !== false; }

  /** Stream summary for the sidebar: counts + Ops gap mix (in-scope activities, all entities, excluding OOS). */
  function streamSummary(session) {
    const acts = activities(session);
    const ents = entityList(session);
    const out = {};
    for (const p of acts) {
      const k = streamKey(p);
      if (!out[k]) out[k] = { key: k, stream: p.stream, label: k, activities: 0, assessments: 0, outOfScope: 0, gapMix: {}, l3: new Set(), masterData: 0 };
      const s = out[k];
      s.activities++;
      if (p.isMasterData) s.masterData++;
      for (const e of ents) {
        const a = session.assessments[aKey(e.key, p.id)];
        if (!a) continue;
        if (a.importStatus === 'OUT_OF_SCOPE' || a.workshop.status === 'OUT_OF_SCOPE') { s.outOfScope++; continue; }
        s.assessments++;
        const g = a.asIs.gap || 'EMPTY';
        s.gapMix[g] = (s.gapMix[g] || 0) + 1;
      }
    }
    const order = ['R2R', 'A2R', 'A2R-FAA', 'A2R-IA', 'I2P', 'I2C', 'ICO'];
    return Object.values(out).map(s => ({ ...s, l3: undefined })).sort((a, b) => { const ia = order.indexOf(a.key), ib = order.indexOf(b.key); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.key.localeCompare(b.key); });
  }

  /** Totals for the KPI strip. */
  function totals(session) {
    const acts = activities(session).filter(p => inScope(session, p));
    const ents = entityList(session);
    const t = { activities: acts.length, entities: ents.length, assessments: 0, outOfScope: 0, gapMix: {}, assessed: 0, files: session.files.length };
    for (const p of acts) for (const e of ents) {
      const a = session.assessments[aKey(e.key, p.id)]; if (!a) continue;
      if (a.importStatus === 'OUT_OF_SCOPE' || a.workshop.status === 'OUT_OF_SCOPE') { t.outOfScope++; continue; }
      t.assessments++;
      if (a.workshop.status) t.assessed++;
      const g = a.asIs.gap || 'EMPTY'; t.gapMix[g] = (t.gapMix[g] || 0) + 1;
    }
    return t;
  }

  /** entities × streams matrix: number of assessments per cell. */
  function entityStreamMatrix(session) {
    const ents = entityList(session), streams = streamSummary(session);
    const m = {};
    for (const [k, a] of Object.entries(session.assessments)) {
      const p = session.processes[a.processId]; if (!p) continue;
      const sk = streamKey(p);
      m[a.entityKey] = m[a.entityKey] || {};
      m[a.entityKey][sk] = (m[a.entityKey][sk] || 0) + 1;
    }
    return { entities: ents, streams, cells: m };
  }

  function validateSession(obj) {
    if (!obj || typeof obj !== 'object') return 'Not a JSON object';
    if (obj.kind !== 'fitgap-workbench-session') return 'Not a Fit-Gap Workbench session file';
    if (typeof obj.version !== 'number' || obj.version > SESSION_VERSION) return 'Session file version ' + obj.version + ' is newer than this build (' + SESSION_VERSION + ')';
    for (const k of ['entities', 'processes', 'assessments', 'files', 'audit']) if (!(k in obj)) return 'Session file is missing "' + k + '"';
    return null;
  }
  /** Fill in fields added by later builds so older session files keep working. */
  function upgradeSession(obj) {
    const fresh = createSession();
    for (const k in fresh) if (!(k in obj)) obj[k] = fresh[k];
    for (const k in fresh.settings) if (!(k in obj.settings)) obj.settings[k] = fresh.settings[k];
    for (const a of Object.values(obj.assessments)) if (!a.workshop) a.workshop = emptyWorkshop();
    return obj;
  }

  FG.model = { SESSION_VERSION, createSession, mergeImport, resolveDiff, logChange, addFeedback, emptyWorkshop, aKey, entityList, processList, activities, streamKey, inScope, streamSummary, totals, entityStreamMatrix, validateSession, upgradeSession };
})(typeof globalThis !== 'undefined' ? globalThis : window);
