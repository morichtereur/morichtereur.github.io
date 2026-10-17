// Template profiles: list, create a new profile from a sample file with an editable
// mapping (titles, sub-headers, field synonyms, header anchor, ID pattern) and a live test.

function allProfiles(session) { return [...Object.values(PROFILES), ...(session.profiles || [])]; }
function cloneProfile(p, id, name) { return { ...JSON.parse(JSON.stringify(p)), id, name, custom: true }; }

function ProfileEditor({ session, updateSession, toast, base, onClose }) {
  const [prof, setProf] = useState(() => cloneProfile(base, newId('prof'), `${base.name} – copy`));
  const [file, setFile] = useState(null); const [result, setResult] = useState(null); const inp = useRef();
  const setPath = (path, v) => setProf(p => { const n = JSON.parse(JSON.stringify(p)); const ks = path.split('.'); let o = n; for (const k of ks.slice(0, -1)) o = o[k]; o[ks[ks.length - 1]] = v; return n; });
  const lines = (arr) => (arr || []).join('\n'); const fromLines = (t) => t.split('\n').map(x => x.trim()).filter(Boolean);
  const csv = (arr) => (arr || []).join(', '); const fromCsv = (t) => t.split(',').map(x => x.trim()).filter(Boolean);
  const test = async (f) => { const ff = f || file; if (!ff) return; try { const wb = XLSX.read(await ff.arrayBuffer(), { type: 'array' }); const r = parseCaptureWorkbook(wb, { XLSX, fileName: ff.name, profile: prof }); setResult(r); } catch (e) { setResult({ ok: false, warnings: [{ level: 'error', message: e.message }] }); } };
  useEffect(() => { if (file) test(file); }, [prof]);
  return html`<div class="card" style="border-color:var(--accent)"><div class="card-head"><h3>New template profile</h3><${IconButton} icon="x" label="Close" onClick=${onClose} /></div><div class="card-body">
    <div class="sg-two">
      <div style="display:grid;gap:.6rem">
        <${Field} label="Profile name"><input class="input sm" value=${prof.name} onInput=${e => setPath('name', e.target.value)} /></${Field}>
        <div class="fgrid"><${Field} label="Header row anchor (cell text)"><input class="input sm" value=${prof.headerRow.anchor} onInput=${e => setPath('headerRow.anchor', e.target.value)} /></${Field}><${Field} label="Rows above the header to scan"><input class="input sm num" value=${prof.headerRow.bandAbove} onInput=${e => setPath('headerRow.bandAbove', Number(e.target.value) || 6)} /></${Field}>
        <${Field} label="Main sheet name pattern (regex)"><input class="input sm mono" value=${prof.mainSheet.include} onInput=${e => setPath('mainSheet.include', e.target.value)} /></${Field}><${Field} label="Process ID pattern (regex)"><input class="input sm mono" value=${prof.dataRow.idPattern} onInput=${e => setPath('dataRow.idPattern', e.target.value)} /></${Field}></div>
        <div class="fgrid">${['level', 'id', 'name', 'description'].map(k => html`<${Field} key=${k} label=${`Core column: ${k} (synonyms)`}><input class="input sm" value=${csv(prof.core[k])} onInput=${e => setPath(`core.${k}`, fromCsv(e.target.value))} /></${Field}>`)}</div>
        ${Object.entries(prof.blocks).map(([kind, b]) => html`<details key=${kind} class="disclosure" open=${['ASIS', 'FITGAP', 'DETAILED'].includes(kind)}><summary>${kind} block – titles and fields <${Icon} name="chevron" size=${14} /></summary><div class="body" style="max-width:none"><div class="fgrid">
          <${Field} label="Title patterns (regex, one per line)"><textarea class="textarea sm mono" style="min-height:3rem" value=${lines(b.titles)} onInput=${e => setPath(`blocks.${kind}.titles`, fromLines(e.target.value))}></textarea></${Field}>
          ${b.subHeaders !== undefined && html`<${Field} label="Sub-header patterns (when no title)"><textarea class="textarea sm mono" style="min-height:3rem" value=${lines(b.subHeaders)} onInput=${e => setPath(`blocks.${kind}.subHeaders`, fromLines(e.target.value))}></textarea></${Field}>`}
          ${Object.entries(b.fields).map(([f, syn]) => html`<${Field} key=${f} label=${`Field ${f} (synonyms)`}><input class="input sm" value=${csv(syn)} onInput=${e => setPath(`blocks.${kind}.fields.${f}`, fromCsv(e.target.value))} /></${Field}>`)}
        </div></div></details>`)}
      </div>
      <div>
        <div class="sg-row"><${Button} variant="outline" size="sm" icon="upload" onClick=${() => inp.current.click()}>Test on a workbook…</${Button}><input ref=${inp} type="file" accept=".xlsx,.xlsm" style="display:none" onChange=${e => { const f = e.target.files[0]; e.target.value = ''; if (f) { setFile(f); test(f); } }} />${file && html`<span class="muted small">${file.name}</span>`}</div>
        ${result && html`<div style="margin-top:.6rem">${result.ok ? html`<div class="small"><b>${result.sheetName}</b> · header row ${result.layout.headerRow + 1} · ${result.entities.length} entities · ${result.summary.activities} activities · ${result.assessments.length} assessments</div><${FileLayout} file=${{ layout: { blocks: result.layout.blocks.map(b => ({ kind: b.kind, entity: b.entity?.name || null, cols: `${colLetter(b.col)}–${colLetter(b.colEnd)}`, fields: Object.fromEntries(Object.entries(b.headers).map(([f, h]) => [f, h.cell])) })) } }} />` : null}<div style="margin-top:.5rem"><${WarningList} warnings=${(result.warnings || []).map(w => ({ ...w, file: file?.name }))} /></div></div>`}
      </div>
    </div>
    <div class="sg-row" style="justify-content:flex-end;margin-top:.8rem"><${Button} variant="text" size="sm" onClick=${onClose}>Cancel</${Button}><${Button} variant="primary" size="sm" onClick=${() => { updateSession(s => { s.profiles = [...(s.profiles || []).filter(p => p.id !== prof.id), prof]; }); toast('Profile saved – select it in the import drop zone'); onClose(); }}>Save profile</${Button}></div>
  </div></div>`;
}

function ProfilesCard({ session, updateSession, toast }) {
  const [editing, setEditing] = useState(null);
  const list = allProfiles(session);
  return html`<div style="display:grid;gap:1rem">
    <${Card} title="Template profiles" stats=${[['profiles', list.length]]}>
      <p class="muted small">A profile describes how blocks, headers and fields are detected in a capture sheet. A new client template is a new profile, not new code.</p>
      <table class="matrix"><tbody>${list.map(p => html`<tr key=${p.id}><td style="text-align:left"><b>${p.name}</b> <span class="mono small muted">${p.id}</span>${p.custom ? '' : html` <span class="muted small">· built-in</span>`}</td><td style="text-align:right;white-space:nowrap"><${Button} variant="text" size="sm" onClick=${() => setEditing(p)}>New profile from this</${Button}>${p.custom && html`<${Button} variant="text" size="sm" onClick=${() => updateSession(s => { s.profiles = s.profiles.filter(x => x.id !== p.id); })}>Delete</${Button}>`}</td></tr>`)}</tbody></table>
    </${Card}>
    ${editing && html`<${ProfileEditor} session=${session} updateSession=${updateSession} toast=${toast} base=${editing} onClose=${() => setEditing(null)} />`}
  </div>`;
}
