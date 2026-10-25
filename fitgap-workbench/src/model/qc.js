// Pre-assessment quality check: what GBS Operations should fix in the capture sheets before the fit-gap workshop.
// Pure functions on the session (browser and Node). One finding per row/cell where possible, so Ops can work the list.
import { GAP } from './constants.js';
import { sheet, polishXlsx } from './exports.js';

const QC_SEV = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', INFO: 'Info' };
const QC_SEV_ORDER = { High: 0, Medium: 1, Low: 2, Info: 3 };
const QC_GAPS_DEV = new Set([GAP.HARMONIZATION, GAP.STANDARDIZATION, GAP.BOTH]);
const qcYn = (v) => (v === true ? 'Y' : v === false ? 'N' : '');
const qcLanes = (le, gbs) => (le === null && gbs === null ? null : `${le ? 'LE' : ''}${le && gbs ? '+' : ''}${gbs ? 'GBS' : ''}` || 'none');

export const QC_CHECKS = {
  ENTITY_NO_LABEL: { sev: QC_SEV.MEDIUM, title: 'No entity label', action: 'Write the entity code and name above the As-Is block (e.g. "100100 Alpha Pharma Ltd").' },
  ENTITY_NO_CODE: { sev: QC_SEV.MEDIUM, title: 'Entity without 6-digit code', action: 'Add the 6-digit entity code to the label.' },
  ENTITY_CODE_SHARED: { sev: QC_SEV.HIGH, title: 'Entity code also used by another country', action: 'Check the entity code – the same code appears in another country\'s files.' },
  DUPLICATE_BLOCK: { sev: QC_SEV.HIGH, title: 'Two blocks for the same entity', action: 'Label each As-Is / Fit-Gap block with its own entity.' },
  DUPLICATE_ID: { sev: QC_SEV.HIGH, title: 'Process ID used twice', action: 'Give the activity its own Process ID (template copy error).' },
  ROW_WITHOUT_ID: { sev: QC_SEV.MEDIUM, title: 'Row without Process ID', action: 'Add the Process ID or delete the row if it is not an activity.' },
  LEVEL_MISSING: { sev: QC_SEV.LOW, title: 'Process Level empty', action: 'Fill the Process Level (taken from the ID for now).' },
  GAP_UNKNOWN: { sev: QC_SEV.HIGH, title: 'GAP value not recognised', action: 'Use one of: No Gap, Harmonization Gap, Standardization Gap, Both Gaps, N/A, Out of scope.' },
  NOT_PREASSESSED: { sev: QC_SEV.HIGH, title: 'Pre-assessment not done for this entity / stream', action: 'Fill the As-Is block (who performs it, systems, GAP) before the workshop.' },
  GAP_MISSING: { sev: QC_SEV.HIGH, title: 'GAP missing', action: 'Fill the initial GAP assessment.' },
  SPLIT_NOT_FILLED: { sev: QC_SEV.HIGH, title: 'As-Is split not filled in this stream', action: 'Fill "LE / Country / Other" and "GBS" (Y/N) for every in-scope activity – the workshop compares it with the To-Be split.' },
  SYSTEM_NOT_FILLED: { sev: QC_SEV.MEDIUM, title: 'As-Is systems not filled in this stream', action: 'Fill "Used Systems" for every in-scope activity.' },
  SPLIT_MISSING: { sev: QC_SEV.MEDIUM, title: 'As-Is split missing (LE / GBS)', action: 'Mark who performs the activity today (Y/N for LE and GBS).' },
  SYSTEM_MISSING: { sev: QC_SEV.LOW, title: 'As-Is system missing', action: 'Name the system or tool used today.' },
  GAP_NO_REASON: { sev: QC_SEV.LOW, title: 'Gap without explanation', action: 'Add one line in "Additional Information" on what differs.' },
  NA_NO_REASON: { sev: QC_SEV.LOW, title: 'N/A without reason', action: 'Say why the activity does not apply (e.g. "no leasing contracts").' },
  SPLIT_VS_GAP: { sev: QC_SEV.MEDIUM, title: 'As-Is split differs from To-Be, GAP without harmonization', action: 'Check the GAP: a different split than To-Be is a harmonization gap.' },
  GAP_VS_SPLIT: { sev: QC_SEV.LOW, title: 'Harmonization although As-Is split equals To-Be', action: 'Check the GAP or the As-Is split – they contradict each other.' },
  WORKSHOP_PREFILLED: { sev: QC_SEV.INFO, title: 'Workshop columns already filled', action: 'Fit-Gap / Detailed Gap are filled in the workshop – confirm these values there.' },
  MISSING_VS_REFERENCE: { sev: QC_SEV.INFO, title: 'Activity in other countries\' templates but not here', action: 'Check whether rows were deleted from the template.' },
  EXTRA_VS_REFERENCE: { sev: QC_SEV.INFO, title: 'Activity not in other countries\' templates', action: 'Check whether the ID / row was added or renamed locally.' },
};

/**
 * @param session  workbench session after import
 * @param opts.reference  optional { name, entityCodes:Set, processIds:Map<stream,Set<id>> } of other countries
 * @returns { summary[], issues[], totals }
 */
export function preAssessmentQC(session, { reference = null } = {}) {
  const issues = []; const push = (code, f) => issues.push({ code, severity: QC_CHECKS[code].sev, check: QC_CHECKS[code].title, action: QC_CHECKS[code].action, ...f });
  const entityName = (code) => session.entities[code]?.displayName || session.entities[code]?.name || code;

  // ---- structure, from the parser warnings of every imported file
  for (const f of session.files) {
    for (const w of f.warnings || []) {
      const base = { file: f.name, sheet: f.sheet };
      if (w.code === 'SINGLE_ENTITY_NO_LABEL') push('ENTITY_NO_LABEL', { ...base, finding: 'No entity label anywhere in the sheet – assigned to the country\'s entity on import.' });
      if (w.code === 'ENTITY_BY_POSITION' || w.code === 'ENTITY_NO_CODE') { const label = (w.message.match(/"([^"]+)"/) || [])[1] || ''; if (!issues.some(i => i.code === 'ENTITY_NO_CODE' && i.file === f.name && i.entity === label)) push('ENTITY_NO_CODE', { ...base, entity: label, finding: `Entity label "${label}" has no 6-digit entity code.` }); }
      if (w.code === 'DUPLICATE_ENTITY_BLOCK') push('DUPLICATE_BLOCK', { ...base, finding: w.message });
      if (w.code === 'DUPLICATE_ID') for (const e of w.examples || []) push('DUPLICATE_ID', { ...base, row: e.row, processId: e.id, activity: e.name, finding: `Row ${e.row} "${e.name}" has the same ID as "${e.first}" – imported as ${e.keptAs}.` });
      if (w.code === 'ROWS_SKIPPED') for (const e of (w.examples || []).filter(x => x.name)) push('ROW_WITHOUT_ID', { ...base, row: e.row, activity: e.name, finding: `Level "${e.level || '–'}", no Process ID – not imported.` });
      if (w.code === 'LEVEL_INFERRED') for (const e of w.examples || []) push('LEVEL_MISSING', { ...base, row: e.row, processId: e.id, finding: `Level taken from the ID: L${e.level}.` });
      if (w.code === 'GAP_UNMAPPED') for (const e of w.examples || []) push('GAP_UNKNOWN', { ...base, row: e.row, cell: e.cell, processId: e.processId, value: e.raw, finding: `"${e.raw}" is not a GAP value – imported as UNCLEAR.` });
    }
  }
  if (reference?.entityCodes) for (const e of Object.values(session.entities)) if (e.hasCode && reference.entityCodes.has(e.code)) push('ENTITY_CODE_SHARED', { entity: `${e.code} ${e.name}`, finding: `${e.code} is also the entity code in ${reference.name}.` });

  // ---- content, per entity × stream
  const groups = new Map();
  for (const a of Object.values(session.assessments)) { const k = `${a.entityCode}|${a.stream}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
  const summary = [];
  for (const [k, list] of [...groups].sort()) {
    const [code, stream] = k.split('|'); const inScope = list.filter(a => !a.scope.outOfScope);
    const gapFilled = inScope.filter(a => a.asIs.gap && a.asIs.gap !== GAP.UNCLEAR).length;
    const splitFilled = inScope.filter(a => a.asIs.le !== null || a.asIs.gbs !== null).length;
    const sysFilled = inScope.filter(a => a.asIs.systems).length;
    const gaps = inScope.filter(a => QC_GAPS_DEV.has(a.asIs.gap)); const gapsExplained = gaps.filter(a => a.asIs.info).length;
    const notDone = inScope.length > 0 && gapFilled / inScope.length < 0.5;
    // A column (almost) empty for the whole stream is one finding, not hundreds of rows.
    const splitEmpty = !notDone && inScope.length > 0 && splitFilled / inScope.length < 0.1, sysEmpty = !notDone && inScope.length > 0 && sysFilled / inScope.length < 0.1;
    const before = issues.length;
    const where = (a, field) => ({ file: a.sources[0]?.file, sheet: a.sources[0]?.sheet, row: a.sources[0]?.row, cell: a.sources[0]?.cells?.asIs?.[field] || '', entity: entityName(code), stream, processId: a.processId, activity: session.processes[a.processId]?.name || '' });
    const col = (f) => { const c = inScope.find(a => a.sources[0]?.cells?.asIs?.[f])?.sources[0].cells.asIs[f]; return c ? c.replace(/\d+$/, '') : ''; };
    if (splitEmpty) push('SPLIT_NOT_FILLED', { entity: entityName(code), stream, file: list[0].sources[0]?.file, sheet: list[0].sources[0]?.sheet, cell: `${col('le')} / ${col('gbs')}`, finding: `${inScope.length - splitFilled} of ${inScope.length} in-scope activities have no As-Is split.` });
    if (sysEmpty) push('SYSTEM_NOT_FILLED', { entity: entityName(code), stream, file: list[0].sources[0]?.file, sheet: list[0].sources[0]?.sheet, cell: col('systems'), finding: `${inScope.length - sysFilled} of ${inScope.length} in-scope activities have no system.` });
    if (notDone) push('NOT_PREASSESSED', { entity: entityName(code), stream, file: list[0].sources[0]?.file, sheet: list[0].sources[0]?.sheet, finding: `${inScope.length - gapFilled} of ${inScope.length} in-scope activities have no GAP${splitFilled ? '' : ' and no As-Is split'}.` });
    for (const a of inScope) {
      const p = session.processes[a.processId] || {}; const tb = p.toBe || {};
      if (!notDone) {
        if (!a.asIs.gap) push('GAP_MISSING', where(a, 'gap'));
        if (!splitEmpty && a.asIs.le === null && a.asIs.gbs === null) push('SPLIT_MISSING', where(a, 'le'));
        if (!sysEmpty && !a.asIs.systems) push('SYSTEM_MISSING', where(a, 'systems'));
      }
      if (QC_GAPS_DEV.has(a.asIs.gap) && !a.asIs.info) push('GAP_NO_REASON', { ...where(a, 'info'), value: a.asIs.gapRaw });
      if (a.asIs.gap === GAP.NA && !a.asIs.info && !/[a-z]{4,}/i.test((a.asIs.gapRaw || '').replace(/^n\/?a/i, ''))) push('NA_NO_REASON', { ...where(a, 'info'), value: a.asIs.gapRaw });
      const asIs = qcLanes(a.asIs.le, a.asIs.gbs), toBe = qcLanes(tb.le ?? null, tb.gbs ?? null);
      if (asIs && toBe && asIs !== toBe && (a.asIs.gap === GAP.NO_GAP || a.asIs.gap === GAP.STANDARDIZATION)) push('SPLIT_VS_GAP', { ...where(a, 'gap'), value: a.asIs.gapRaw, finding: `As-Is ${asIs} · To-Be ${toBe} · GAP "${a.asIs.gapRaw}".` });
      if (asIs && toBe && asIs === toBe && (a.asIs.gap === GAP.HARMONIZATION || a.asIs.gap === GAP.BOTH)) push('GAP_VS_SPLIT', { ...where(a, 'gap'), value: a.asIs.gapRaw, finding: `As-Is and To-Be both ${asIs} · GAP "${a.asIs.gapRaw}".` });
      const fg = a.fitGap || {}; const dgFilled = Object.entries(a.detailedGap || {}).filter(([f, v]) => f !== 'extra' && v).length;
      if (fg.local !== null || fg.gbs !== null || fg.other !== null || dgFilled) push('WORKSHOP_PREFILLED', { ...where(a, 'gap'), finding: `Fit-Gap split ${qcYn(fg.local) || '–'}/${qcYn(fg.other) || '–'}/${qcYn(fg.gbs) || '–'}${dgFilled ? `, ${dgFilled} Detailed Gap field(s)` : ''}${fg.fte !== null && fg.fte !== undefined ? `, FTE ${fg.fte}` : ''}.` });
    }
    const mine = issues.slice(before);
    const pct = (n) => (inScope.length ? Math.round(100 * n / inScope.length) : 0);
    const readiness = !inScope.length ? 'n/a' : notDone ? 'Red' : pct(gapFilled) >= 95 && pct(splitFilled) >= 90 ? 'Green' : pct(gapFilled) >= 80 && pct(splitFilled) >= 50 ? 'Amber' : 'Red';
    summary.push({ entityCode: code, entity: entityName(code), stream, activities: list.length, outOfScope: list.length - inScope.length, inScope: inScope.length, gapPct: pct(gapFilled), splitPct: pct(splitFilled), systemPct: pct(sysFilled), gaps: gaps.length, gapsExplainedPct: gaps.length ? Math.round(100 * gapsExplained / gaps.length) : 100, high: mine.filter(i => i.severity === QC_SEV.HIGH).length, medium: mine.filter(i => i.severity === QC_SEV.MEDIUM).length, low: mine.filter(i => i.severity === QC_SEV.LOW).length, readiness });
  }

  // ---- template completeness against other countries
  if (reference?.processIds) {
    const own = new Map(); for (const p of Object.values(session.processes)) { if (p.level < 4 || / \(\d+\)$/.test(p.id)) continue; if (!own.has(p.stream)) own.set(p.stream, new Set()); own.get(p.stream).add(p.id); }
    for (const [stream, ref] of reference.processIds) {
      const mine = own.get(stream); if (!mine) continue;
      for (const id of [...ref].filter(x => !mine.has(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) push('MISSING_VS_REFERENCE', { stream, processId: id, activity: reference.names?.get(id) || '', finding: `In ${reference.name}, not in this country's sheet.` });
      for (const id of [...mine].filter(x => !ref.has(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) push('EXTRA_VS_REFERENCE', { stream, processId: id, activity: session.processes[id]?.name || '', finding: `Not in ${reference.name}.` });
    }
  }
  issues.sort((a, b) => QC_SEV_ORDER[a.severity] - QC_SEV_ORDER[b.severity] || String(a.file || '').localeCompare(String(b.file || '')) || (a.row || 0) - (b.row || 0));
  const totals = { high: issues.filter(i => i.severity === QC_SEV.HIGH).length, medium: issues.filter(i => i.severity === QC_SEV.MEDIUM).length, low: issues.filter(i => i.severity === QC_SEV.LOW).length, info: issues.filter(i => i.severity === QC_SEV.INFO).length };
  return { summary, issues, totals };
}

/** Excel for GBS Operations: Summary · Issues (one row per cell to fix) · Checks (what each check means). */
export function buildQcWorkbook(session, XLSX, qc) {
  const wb = XLSX.utils.book_new(); const st = session.settings;
  const summaryRows = qc.summary.map(s => ({ 'Entity code': session.entities[s.entityCode]?.hasCode ? s.entityCode : '', 'Entity': s.entity, 'Stream': s.stream, 'Readiness': s.readiness, 'Activities': s.activities, 'Out of scope': s.outOfScope, 'In scope': s.inScope, 'GAP filled %': s.gapPct, 'As-Is split filled %': s.splitPct, 'System filled %': s.systemPct, 'Gaps (H/S/B)': s.gaps, 'Gaps explained %': s.gapsExplainedPct, 'High': s.high, 'Medium': s.medium, 'Low': s.low }));
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, summaryRows, ['Entity', 'Stream']), 'Summary');
  const issueRows = qc.issues.map((i, n) => ({ '#': n + 1, 'Severity': i.severity, 'Check': i.check, 'File': i.file || '', 'Sheet': i.sheet || '', 'Row': i.row || '', 'Cell': i.cell || '', 'Entity': i.entity || '', 'Stream': i.stream || '', 'Process ID': i.processId || '', 'Activity': i.activity || '', 'Value': i.value || '', 'Finding': i.finding || '', 'Action for GBS Ops': i.action, 'Status': '', 'Comment Ops': '' }));
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, issueRows, ['#', 'Severity', 'Check']), 'Issues');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, Object.values(QC_CHECKS).map(c => ({ 'Severity': c.sev, 'Check': c.title, 'What to do': c.action })), ['Severity', 'Check', 'What to do']), 'Checks');
  const about = XLSX.utils.aoa_to_sheet([['Pre-assessment quality check'], ['Client', st.clientName], ['Country', st.country], ['Files', session.files.map(f => f.name).join('; ')], ['Checked', new Date().toISOString().slice(0, 16).replace('T', ' ')], ['Findings', `${qc.totals.high} high · ${qc.totals.medium} medium · ${qc.totals.low} low · ${qc.totals.info} info`], ['Readiness', 'Green: GAP ≥ 95 % and As-Is split ≥ 90 % of in-scope activities · Amber: GAP ≥ 80 % and split ≥ 50 % · Red: below, or the pre-assessment was not done'], ['How to use', 'Work the Issues sheet top-down (High first), set Status, send the corrected workbooks back before the workshop.']]);
  about['!cols'] = [{ wch: 18 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, about, 'About');
  return wb;
}

export async function qcWorkbookBytes(session, XLSX, JSZip, qc) {
  return polishXlsx(new Uint8Array(XLSX.write(buildQcWorkbook(session, XLSX, qc), { bookType: 'xlsx', type: 'array' })), JSZip);
}
