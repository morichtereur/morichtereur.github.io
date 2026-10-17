// HAND-OVER: export package (zip) for knowledge transfer and write-back into the original workbooks.

async function buildHandoverPackage(session) {
  const zip = new JSZip(); const base = exportFileName(session, 'handover');
  const xlsx = (wb) => XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const dev = deviationRows(session);
  const approved = dev.filter(r => r['Approval status'] === 'APPROVED');
  const mk = (rows, name) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: 'no rows' }]), name.slice(0, 31)); return wb; };
  zip.file('01_deviation-log_full.xlsx', xlsx(buildDeviationLogWorkbook(session, XLSX)));
  zip.file('02_deviation-log_approved.xlsx', xlsx(mk(approved, 'Approved deviations')));
  zip.file('03_separate-variants_for-DTPs.xlsx', xlsx(mk(dev.filter(r => r['Resolution approach'] === 'Separate variant'), 'Separate variants')));
  zip.file('04_initiative-candidates_PE-WP3.xlsx', xlsx(mk(initiativeRows(session), 'Initiative candidates')));
  zip.file('05_taxonomy-change-requests.xlsx', xlsx(mk(taxonomyRows(session), 'Taxonomy change requests')));
  const q = qg2Readiness(session);
  const qgRows = q.streams.map(s => { const p = q.perStream[s]; return { Stream: s, 'QG2-ready': p.ready ? 'Y' : 'N', 'Activities': p.total, 'Assessed': p.assessed, 'Deviations': p.deviations, 'No owner': p.noOwner, 'Undecided approach': p.undecided, 'No approval': p.noApproval, 'No justification': p.noJustification, 'Open questions': p.openQuestions, 'Process Expert': p.signoff.pe.name, 'PE date': p.signoff.pe.date, 'GBS Operations': p.signoff.ops.name, 'Ops date': p.signoff.ops.date }; });
  const qwb = mk(qgRows, 'QG2 sign-off'); XLSX.utils.book_append_sheet(qwb, XLSX.utils.json_to_sheet(q.cells.map(c => ({ Entity: session.entities[c.entityCode]?.displayName || c.entityCode, Stream: c.stream, Activities: c.total, Assessed: c.assessed, Deviations: c.deviations, 'No owner': c.noOwner, 'Undecided': c.undecided, 'No approval': c.noApproval, 'Open questions': c.openQuestions }))), 'Per entity x stream');
  zip.file('06_qg2-signoff-summary.xlsx', xlsx(qwb));
  zip.file('07_flat-export_all-assessments.xlsx', xlsx(buildFlatWorkbook(session, XLSX)));
  zip.file('08_audit-trail.xlsx', xlsx(buildAuditWorkbook(session, XLSX)));
  zip.file('09_session.json', serializeSession(session));
  zip.file('README.txt', `GBS Fit-Gap Workbench – hand-over package\nClient: ${session.settings.clientName}\nCountry: ${session.settings.country}\nExported: ${new Date().toISOString()}\n\n01 deviation log (all gaps, + initiative candidates + taxonomy change requests)\n02 approved deviations only\n03 separate variants – input for the DTPs\n04 initiative candidates for PE / WP3\n05 taxonomy change requests for the agreed change path\n06 QG2 readiness and sign-off per stream\n07 flat export of every entity x activity incl. audit log\n08 audit trail\n09 session file – open with the workbench (3 Run → Data & exports → Load session)\n`);
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), name: `${base}.zip`, counts: { deviations: dev.length, approved: approved.length } };
}

function WriteBackCard({ session, toast }) {
  const inp = useRef(); const [log, setLog] = useState([]); const [onlyTouched, setOnlyTouched] = useState(true);
  const onFiles = async (e) => {
    const files = Array.from(e.target.files); e.target.value = ''; const out = [];
    for (const f of files) {
      const rec = session.files.find(x => x.name === f.name);
      if (!rec) { out.push({ name: f.name, error: 'not an imported file – the name must match the imported workbook' }); continue; }
      try {
        const zip = await JSZip.loadAsync(await f.arrayBuffer());
        const res = await writeBackWorkbook(zip, session, f.name, { onlyTouched });
        const blob = await res.zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        downloadBlob(f.name.replace(/\.xlsx?$/i, '') + '_workshop.xlsx', blob);
        out.push({ name: f.name, written: res.written, sheets: res.sheets });
      } catch (err) { out.push({ name: f.name, error: err.message }); }
    }
    setLog(out); toast(`${out.filter(x => !x.error).length} workbook(s) written back`);
  };
  return html`<${Card} title="Write back into the original workbooks">
    <p class="muted small">Pick the original capture workbooks (same file names as imported). Workshop values are written into the Fit-Gap and Detailed Gap cells of the right entity block by patching the sheet XML – formatting, images, data validations and merged cells stay untouched. You get a copy named "…_workshop.xlsx".</p>
    <div class="sg-row"><${Button} variant="primary" icon="upload" onClick=${() => inp.current.click()}>Choose original workbooks…</${Button}><input ref=${inp} type="file" multiple accept=".xlsx,.xlsm" style="display:none" onChange=${onFiles} /><${Switch} checked=${onlyTouched} onChange=${setOnlyTouched}>only activities touched in the workshop</${Switch}></div>
    ${log.length > 0 && html`<ul class="small" style="margin:.6rem 0 0;padding-left:1.1rem">${log.map((l, i) => html`<li key=${i}>${l.name}: ${l.error ? html`<span style="color:var(--flag)">${l.error}</span>` : `${l.written} cells written (${l.sheets.map(s => s.sheetName).join(', ')})`}</li>`)}</ul>`}
  </${Card}>`;
}

function HandoverPage({ session, toast }) {
  const [busy, setBusy] = useState(false);
  const dev = deviationRows(session); const q = qg2Readiness(session);
  const items = [['Approved deviation log', dev.filter(r => r['Approval status'] === 'APPROVED').length, dev.length], ['Separate-variant list (input for DTPs)', dev.filter(r => r['Resolution approach'] === 'Separate variant').length], ['Initiative candidates (PE / WP3)', initiativeRows(session).length], ['Taxonomy change requests', taxonomyRows(session).length], ['QG2 sign-off summary', q.streams.filter(s => q.perStream[s].ready).length, q.streams.length]];
  return html`<div>
    <${PageHead} eyebrow="6 · Hand-over" title="Hand-over package" lead="Everything knowledge transfer needs in one zip: approved deviation log, separate-variant list for the DTPs, initiative candidates, taxonomy change requests, QG2 sign-off summary, the full flat export, the audit trail and the session file." />
    <div class="import-grid">
      <${Card} title="Package contents"><table class="matrix"><tbody>${items.map(([l, n, of]) => html`<tr key=${l}><td style="text-align:left">${l}</td><td class="num"><b>${n}</b>${of !== undefined ? html`<span class="muted"> / ${of}</span>` : ''}</td></tr>`)}</tbody></table>
        <div class="sg-row" style="margin-top:.8rem"><${Button} variant="primary" icon="file" disabled=${busy || !Object.keys(session.assessments).length} onClick=${async () => { setBusy(true); try { const p = await buildHandoverPackage(session); downloadBlob(p.name, p.blob); toast(`Hand-over package downloaded (${p.counts.deviations} deviations, ${p.counts.approved} approved)`); } finally { setBusy(false); } }}>${busy ? 'Building…' : 'Download hand-over package (.zip)'}</${Button}></div>
        ${q.streams.some(s => !q.perStream[s].ready) && html`<p class="sg-note" style="color:var(--g-harm)">Not every stream is QG2-ready yet (${q.streams.filter(s => !q.perStream[s].ready).join(', ')}). The package can still be built as a working version.</p>`}
      </${Card}>
      <${WriteBackCard} session=${session} toast=${toast} />
    </div>
  </div>`;
}
