// Session save/load (JSON) and the xlsx exports, plus the download helper.

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}
function downloadWorkbook(name, wb) { const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }); downloadBlob(`${name}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); }
function downloadSessionJson(session) { downloadBlob(`${exportFileName(session, 'session')}.json`, new Blob([serializeSession(session)], { type: 'application/json' })); }

function ExportsCard({ session, summary, updateSession, toast, onReplaceSession }) {
  const inp = useRef(); const [confirmLoad, setConfirmLoad] = useState(null);
  const devCount = deviationRows(session).length;
  const onLoad = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const loaded = deserializeSession(await f.text()); setConfirmLoad({ name: f.name, session: loaded }); } catch (err) { toast(`Not a session file: ${err.message}`); } };
  const hasData = Object.keys(session.assessments).length > 0;
  return html`<${Card} title="Session file & exports">
    <div class="eyebrow" style="margin-bottom:.4rem">Session file (JSON)</div>
    <p class="muted small">Autosave keeps the session in this browser. Download the JSON at the end of every session block and to continue on another laptop.</p>
    <div class="sg-row"><${Button} variant="primary" icon="save" onClick=${() => { downloadSessionJson(session); toast('Session file downloaded'); }}>Save session</${Button}><${Button} variant="outline" icon="upload" onClick=${() => inp.current.click()}>Load session…</${Button}><input ref=${inp} type="file" accept=".json" style="display:none" onChange=${onLoad} /><span class="muted small">${session.updatedAt ? `last change ${new Date(session.updatedAt).toLocaleString()}` : ''}</span></div>
    ${confirmLoad && html`<div class="entity-choice" style="margin:.6rem 0"><span><b>${confirmLoad.name}</b>: ${Object.keys(confirmLoad.session.entities).length} entities, ${Object.keys(confirmLoad.session.assessments).length} assessments, ${confirmLoad.session.audit.length} audit entries. Replace the current session in this browser?</span><span class="sg-row" style="margin:0"><${Button} variant="primary" size="sm" onClick=${() => { onReplaceSession(confirmLoad.session); setConfirmLoad(null); }}>Replace</${Button}><${Button} variant="text" size="sm" onClick=${() => setConfirmLoad(null)}>Cancel</${Button}></span></div>`}
    <hr />
    <div class="eyebrow" style="margin-bottom:.4rem">Workshop outputs (.xlsx)</div>
    <div class="sg-row">
      <${Button} variant="outline" icon="file" disabled=${!hasData} onClick=${() => { downloadWorkbook(exportFileName(session, 'deviation-log'), buildDeviationLogWorkbook(session, XLSX)); toast('Deviation log exported'); }}>Deviation log <span class="muted">(${devCount})</span></${Button}>
      <${Button} variant="outline" icon="file" disabled=${!hasData} onClick=${() => { downloadWorkbook(exportFileName(session, 'flat-export'), buildFlatWorkbook(session, XLSX)); toast('Flat export downloaded'); }}>Flat export <span class="muted">(${Object.keys(session.assessments).length} rows)</span></${Button}>
      <${Button} variant="outline" icon="file" disabled=${!session.audit.length} onClick=${() => { downloadWorkbook(exportFileName(session, 'audit-trail'), buildAuditWorkbook(session, XLSX)); toast('Audit trail exported'); }}>Audit trail <span class="muted">(${session.audit.length})</span></${Button}>
      <${Button} variant="text" onClick=${() => window.print()}>Print summary</${Button}>
    </div>
    <p class="sg-note">Deviation log = one row per entity × activity with a harmonization, standardization or both gap (workshop gap type, else Ops), plus sheets "Initiative candidates" and "Taxonomy change requests". Flat export = every entity × activity with all fields, audit log, sessions, participants and feedback.</p>
  </${Card}>`;
}
