// Export builders: deviation log (primary workshop output), flat export, audit
// trail. Pure: they return rows / SheetJS workbooks with XLSX injected.
import { GAP, GAP_LABEL, WORKSHOP_STATUS_LABEL, DIMENSION_LABEL, RESOLUTION_LABEL, ESCALATION_LABEL, DETAILED_GAP_FIELDS, DETAILED_GAP_LABEL } from './constants.js';
import { effectiveGap, GAP_TYPES_WITH_DEVIATION, NA } from './workshop.js';

const yn = (v) => v === true ? 'Y' : v === false ? 'N' : v && v.text ? v.text : '';
const ts = (s) => s ? s.replace('T', ' ').slice(0, 16) : '';

function ancestors(session, p) { const out = []; let cur = session.processes[p?.parentId]; while (cur) { out.unshift(cur); cur = session.processes[cur.parentId]; } return out; }
function levelName(session, p, level) { const a = ancestors(session, p).find(x => x.level === level); return a ? `${a.id} ${a.name}` : ''; }
function sessionLabel(session, id) { const s = session.sessions.find(x => x.id === id); return s ? `${s.date} ${s.start || ''} ${s.stream}`.trim() : ''; }
function lastChange(session, key) { for (let i = session.audit.length - 1; i >= 0; i--) if (session.audit[i].key === key) return session.audit[i]; return null; }
function participant(session, id) { const p = session.participants.find(x => x.id === id); return p ? `${p.name} (${p.organisation})` : (id || ''); }
function entityName(session, code) { const e = session.entities[code]; return e ? (e.displayName || e.name) : code; }
function detailedFindings(a) { return DETAILED_GAP_FIELDS.filter(f => a.detailedGap[f] && a.detailedGap[f] !== NA).map(f => `${DETAILED_GAP_LABEL[f]}: ${a.detailedGap[f]}`).join(' | '); }

export function deviationRows(session) {
  const rows = [];
  for (const a of Object.values(session.assessments)) {
    const gap = effectiveGap(a);
    if (a.scope.outOfScope || !GAP_TYPES_WITH_DEVIATION.has(gap)) continue;
    const p = session.processes[a.processId] || {}; const d = a.deviation || {}; const lc = lastChange(session, a.key);
    rows.push({
      'Entity code': session.entities[a.entityCode]?.hasCode ? a.entityCode : '', 'Entity': entityName(session, a.entityCode), 'Country': session.entities[a.entityCode]?.country || session.settings.country || '',
      'Stream': a.stream, 'L2': levelName(session, p, 1), 'L3': levelName(session, p, 2), 'Process ID': a.processId, 'Process': p.name || '',
      'Gap type (workshop)': GAP_LABEL[gap] || gap, 'Gap type (Ops)': GAP_LABEL[a.asIs.gap] || '', 'Dimension': (d.dimensions || []).map(x => DIMENSION_LABEL[x] || x).join(', '),
      'Description': a.workshop.rationale || '', 'Detailed gap findings': detailedFindings(a), 'Resolution approach': RESOLUTION_LABEL[d.resolution] || '', 'Justification': d.justification || '',
      'Accountable owner': participant(session, d.ownerId), 'Target date': d.targetDate || '', 'Escalation level': ESCALATION_LABEL[d.escalation] || '', 'Approval status': d.approval || 'PROPOSED',
      'Initiative candidate': (gap === GAP.STANDARDIZATION || gap === GAP.BOTH) && d.initiativeCandidate !== false ? 'Y' : '', 'Linked initiative': d.linkedInitiative || '',
      'Workshop status': WORKSHOP_STATUS_LABEL[a.workshop.status] || a.workshop.status, 'Comment': a.workshop.comment || '', 'Next step': a.workshop.nextStep || '', 'Next step owner': participant(session, a.workshop.owner), 'Due': a.workshop.due || '',
      'Session': sessionLabel(session, lc?.sessionId), 'Last change': ts(a.workshop.changedAt), 'Changed by': lc?.editor || '',
    });
  }
  return rows.sort((x, y) => (x['Stream'] + x['Process ID'] + x['Entity']).localeCompare(y['Stream'] + y['Process ID'] + y['Entity'], undefined, { numeric: true }));
}

export function initiativeRows(session) {
  return deviationRows(session).filter(r => r['Initiative candidate'] === 'Y').map(r => ({ 'Entity': r['Entity'], 'Stream': r['Stream'], 'Process ID': r['Process ID'], 'Process': r['Process'], 'Gap type': r['Gap type (workshop)'], 'Linked initiative': r['Linked initiative'], 'Description': r['Description'], 'Detailed gap findings': r['Detailed gap findings'], 'Owner': r['Accountable owner'], 'Approval status': r['Approval status'], 'Session': r['Session'] }));
}

export function taxonomyRows(session) {
  return session.taxonomyChangeRequests.map(t => ({ 'Process ID': t.processId, 'Process': session.processes[t.processId]?.name || '', 'Stream': session.processes[t.processId]?.stream || '', 'Proposed change': t.proposedChange, 'Reason': t.reason, 'Raised by': t.raisedBy || '', 'Session': sessionLabel(session, t.sessionId), 'Date': ts(t.ts) }));
}

export function flatRows(session) {
  const rows = [];
  for (const a of Object.values(session.assessments)) {
    const p = session.processes[a.processId] || {}; const d = a.deviation || {}; const gap = effectiveGap(a);
    const r = {
      'Entity code': session.entities[a.entityCode]?.hasCode ? a.entityCode : '', 'Entity': entityName(session, a.entityCode), 'Stream': a.stream, 'L1': levelName(session, p, 0), 'L2': levelName(session, p, 1), 'L3': levelName(session, p, 2), 'Level': p.level, 'Process ID': a.processId, 'Process': p.name || '', 'Activity description': p.description || '',
      'To-Be LE': yn(p.toBe?.le), 'To-Be GBS': yn(p.toBe?.gbs), 'To-Be system': p.toBe?.system || '', 'Planned initiative': p.toBe?.initiative || '',
      'Ops LE/Country/Other': yn(a.asIs.le), 'Ops GBS': yn(a.asIs.gbs), 'Ops used systems': a.asIs.systems || '', 'Ops GAP': GAP_LABEL[a.asIs.gap] || '', 'Ops GAP (raw)': a.asIs.gapRaw || '', 'Ops additional information': a.asIs.info || '',
      'Scope': a.scope.outOfScope ? 'Out of scope' : 'In scope', 'Scope source': a.scope.source || '',
      'Fit-Gap Local Accounting': yn(a.fitGap.local), 'Fit-Gap Other': yn(a.fitGap.other), 'Fit-Gap GBS': yn(a.fitGap.gbs), 'FTE': a.fitGap.fte ?? '',
    };
    for (const f of DETAILED_GAP_FIELDS) r[`DG ${DETAILED_GAP_LABEL[f]}`] = a.detailedGap[f] || '';
    Object.assign(r, {
      'Workshop gap type': GAP_LABEL[gap] || '', 'Rationale': a.workshop.rationale || '', 'Workshop status': WORKSHOP_STATUS_LABEL[a.workshop.status] || '', 'Comment': a.workshop.comment || '', 'Next step': a.workshop.nextStep || '', 'Next step owner': participant(session, a.workshop.owner), 'Due': a.workshop.due || '',
      'Deviation dimension': (d.dimensions || []).map(x => DIMENSION_LABEL[x] || x).join(', '), 'Resolution approach': RESOLUTION_LABEL[d.resolution] || '', 'Justification': d.justification || '', 'Accountable owner': participant(session, d.ownerId), 'Target date': d.targetDate || '', 'Escalation level': ESCALATION_LABEL[d.escalation] || '', 'Approval status': d.resolution || d.dimensions?.length ? (d.approval || 'PROPOSED') : '', 'Linked initiative': d.linkedInitiative || '',
      'Last change': ts(a.workshop.changedAt), 'Source files': a.sources.map(s => s.file).join('; '), 'Notes': a.notes.map(n => n.text).join(' | '),
    });
    rows.push(r);
  }
  return rows.sort((x, y) => (x['Stream'] + x['Process ID'] + x['Entity']).localeCompare(y['Stream'] + y['Process ID'] + y['Entity'], undefined, { numeric: true }));
}

export function auditRows(session) {
  return session.audit.map(e => { const a = session.assessments[e.key]; return { 'Timestamp': ts(e.ts), 'Entity': a ? entityName(session, a.entityCode) : '', 'Process ID': a ? a.processId : e.key, 'Field': e.field, 'Old': fmt(e.old), 'New': fmt(e.new), 'Session': sessionLabel(session, e.sessionId), 'Editor': e.editor || '', 'Bulk': e.bulkId || '', 'Note': e.note || '' }; });
}
function fmt(v) { if (v === null || v === undefined) return ''; if (typeof v === 'object') return JSON.stringify(v); return String(v); }

export function feedbackRows(session) { return session.feedback.map(f => ({ 'Timestamp': ts(f.ts), 'View': f.view, 'Note': f.note, 'Session': sessionLabel(session, f.sessionId) })); }

function sheet(XLSX, rows, header) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(header.map(h => [h, '']))], { header: rows.length ? undefined : header });
  const cols = Object.keys(rows[0] || Object.fromEntries(header.map(h => [h, ''])));
  ws['!cols'] = cols.map(c => ({ wch: Math.min(60, Math.max(10, c.length + 2, ...rows.slice(0, 200).map(r => String(r[c] ?? '').length + 2))) }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  return ws;
}

export function buildDeviationLogWorkbook(session, XLSX) {
  const wb = XLSX.utils.book_new();
  const dev = deviationRows(session);
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, dev, ['Entity', 'Stream', 'Process ID']), 'Deviation log');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, initiativeRows(session), ['Entity', 'Stream', 'Process ID']), 'Initiative candidates');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, taxonomyRows(session), ['Process ID', 'Proposed change', 'Reason']), 'Taxonomy change requests');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['GBS Fit-Gap Workbench – deviation log'], ['Client', session.settings.clientName], ['Country', session.settings.country], ['Exported', new Date().toISOString().slice(0, 16).replace('T', ' ')], ['Deviations', dev.length], ['Entities', Object.keys(session.entities).length], ['Assessments', Object.keys(session.assessments).length]]), 'About');
  return wb;
}

export function buildFlatWorkbook(session, XLSX) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, flatRows(session), ['Entity', 'Stream', 'Process ID']), 'Assessments');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, auditRows(session), ['Timestamp', 'Field']), 'Audit log');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, session.sessions.map(s => ({ 'Date': s.date, 'Start': s.start, 'End': s.end, 'Stream': s.stream, 'Participants': s.participantIds.map(id => participant(session, id)).join('; '), 'Recording': s.recording || '', 'Note': s.note || '', 'Started': ts(s.startedAt), 'Ended': ts(s.endedAt) })), ['Date', 'Stream']), 'Sessions');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, session.participants.map(p => ({ 'Name': p.name, 'Role': p.role, 'Organisation': p.organisation, 'Entity': p.entityCode ? entityName(session, p.entityCode) : '' })), ['Name']), 'Participants');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, feedbackRows(session), ['Timestamp', 'View', 'Note']), 'Feedback');
  return wb;
}

export function buildAuditWorkbook(session, XLSX) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, auditRows(session), ['Timestamp', 'Field']), 'Audit log');
  return wb;
}

export function exportFileName(session, kind) {
  const c = (session.settings.clientName || 'FitGap').replace(/[^\w-]+/g, '_'), k = (session.settings.country || '').replace(/[^\w-]+/g, '_');
  return `${c}${k ? '_' + k : ''}_${kind}_${new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`;
}
