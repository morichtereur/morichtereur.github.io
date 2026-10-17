// Import & data view: drag & drop of capture workbooks, per-file progress, sheet
// choice, entity confirmation, import summary cards and per-file layout detail.

function readWorkbook(buffer) { return XLSX.read(buffer, { type: 'array', cellStyles: false, cellNF: false, cellHTML: false }); }
const tick = () => new Promise(r => setTimeout(r, 0));

function useImportQueue(updateSession, onBatchDone, profileRef) {
  const [jobs, setJobs] = useState([]);
  const wbRef = useRef({});
  const finishFlows = async (buf, wb, parsed) => { try { let procs; updateSession(s => { procs = s.processes; }); const flows = await extractFlowsForImport(buf, wb, parsed, procs || {}); if (flows.length) updateSession(s => { s.flows = s.flows.filter(f => f.file !== parsed.fileName).concat(flows); }); return flows.length; } catch (e) { console.warn('flow extraction failed', e); return 0; } };
  const patch = (id, p) => setJobs(js => js.map(j => j.id === id ? { ...j, ...p } : j));
  const finish = (id, parsed) => {
    let report;
    updateSession(s => { report = mergeParsedWorkbook(s, parsed); });
    patch(id, { status: 'done', progress: 100, message: `${parsed.sheetName} · ${parsed.entities.length} entities · ${parsed.summary.activities} activities · +${report.assessments.added} / ${report.assessments.merged} merged${report.assessments.changedOps ? ` · ${report.assessments.changedOps} Ops values changed` : ''}`, warn: parsed.warnings.filter(w => w.level !== 'info').length, report });
    delete wbRef.current[id];
    return report;
  };
  const run = async (files) => {
    const list = Array.from(files).filter(f => /\.xlsx?$|\.xlsm$/i.test(f.name));
    const newJobs = list.map(f => ({ id: newId('job'), name: f.name, size: f.size, status: 'queued', progress: 0, message: '' }));
    setJobs(js => [...js.filter(j => !list.some(f => f.name === j.name)), ...newJobs]);
    const results = [];
    for (let i = 0; i < list.length; i++) {
      const job = newJobs[i], file = list[i];
      try {
        patch(job.id, { status: 'reading', progress: 15, message: 'Reading file…' }); await tick();
        const buf = await file.arrayBuffer();
        patch(job.id, { status: 'parsing', progress: 45, message: 'Parsing workbook…' }); await tick();
        const wb = readWorkbook(buf);
        patch(job.id, { progress: 75, message: 'Detecting layout…' }); await tick();
        const parsed = parseCaptureWorkbook(wb, { XLSX, fileName: file.name, profile: profileRef?.current || undefined });
        if (parsed.needsSheetChoice) { wbRef.current[job.id] = { wb, buf }; patch(job.id, { status: 'choice', progress: 80, message: 'Several candidate sheets – pick one', candidates: parsed.sheets.candidates }); continue; }
        if (!parsed.ok) { patch(job.id, { status: 'error', progress: 100, message: parsed.warnings.map(w => w.message).join(' ') }); continue; }
        results.push(finish(job.id, parsed));
        const nf = await finishFlows(buf, wb, parsed); if (nf) patch(job.id, { message: `${nf} flow image${nf > 1 ? 's' : ''} extracted` });
      } catch (e) { patch(job.id, { status: 'error', progress: 100, message: `Could not read this file: ${e.message}` }); results.push({ error: e }); }
      await tick();
    }
    onBatchDone && onBatchDone(results, list.length);
  };
  const choose = (id, sheetName) => {
    const entry = wbRef.current[id]; const job = jobs.find(j => j.id === id); if (!entry || !job) return;
    const parsed = parseCaptureWorkbook(entry.wb, { XLSX, fileName: job.name, sheetName, profile: profileRef?.current || undefined });
    if (!parsed.ok) { patch(id, { status: 'error', progress: 100, message: parsed.warnings.map(w => w.message).join(' ') }); return; }
    onBatchDone && onBatchDone([finish(id, parsed)], 1);
    finishFlows(entry.buf, entry.wb, parsed);
  };
  return { jobs, run, choose, clear: () => setJobs([]) };
}

function DropZone({ onFiles, compact, profiles, profileId, setProfileId }) {
  const [over, setOver] = useState(false); const inp = useRef();
  const onDrop = (e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); };
  return html`<div class=${`dropzone${over ? ' over' : ''}`} style=${compact ? 'padding:1.1rem' : ''} onDragOver=${e => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)} onDrop=${onDrop}>
    <input ref=${inp} type="file" multiple accept=".xlsx,.xlsm" onChange=${e => { onFiles(e.target.files); e.target.value = ''; }} />
    ${!compact && html`<div class="ico"><${Icon} name="upload" size=${22} /></div><h3>Drop the stream capture sheets here</h3><p>All files at once: R2R, A2R, I2P, I2C, ICO and I2C_CMD. Versions re-sent later are merged by Process ID and entity – never duplicated, workshop results are never overwritten.</p>`}
    <${Button} variant=${compact ? 'outline' : 'primary'} icon="upload" onClick=${() => inp.current.click()}>${compact ? 'Add or re-import files' : 'Choose files'}</${Button}>
    ${compact && html`<span class="muted small" style="margin-left:.6rem">or drop them here</span>`}
    ${profiles && profiles.length > 1 && html`<div style="margin-top:.6rem"><label class="small muted">Template profile </label><select class="select sm" style="width:auto" value=${profileId} onChange=${e => setProfileId(e.target.value)}>${profiles.map(p => html`<option value=${p.id} key=${p.id}>${p.name}</option>`)}</select></div>`}
  </div>`;
}

function JobRow({ job, onChoose }) {
  const cls = job.status === 'done' ? (job.warn ? 'warn' : 'ok') : job.status === 'error' ? 'err' : job.status === 'choice' ? 'warn' : '';
  const label = { queued: 'queued', reading: 'reading', parsing: 'parsing', choice: 'pick sheet', done: job.warn ? `${job.warn} warning${job.warn > 1 ? 's' : ''}` : 'imported', error: 'failed' }[job.status];
  return html`<div class="filerow"><${Icon} name="file" /><span><b>${job.name}</b> <span class="muted small">${(job.size / 1024).toFixed(0)} KB</span></span><span class=${`st ${cls}`}>${label}</span>
    ${job.status !== 'done' && job.status !== 'error' && html`<div class="bar"><i style=${`width:${job.progress}%`}></i></div>`}
    ${job.message && html`<span class="sub">${job.message}</span>`}
    ${job.status === 'choice' && html`<div class="choice"><select class="select sm" style="width:auto" id=${`sel-${job.id}`}>${job.candidates.map(c => html`<option value=${c}>${c}</option>`)}</select><${Button} variant="primary" size="sm" onClick=${() => onChoose(job.id, document.getElementById(`sel-${job.id}`).value)}>Use this sheet</${Button}></div>`}
  </div>`;
}

function PendingEntities({ session, updateSession }) {
  const list = session.pendingEntityMatches;
  if (!list.length) return null;
  return html`<div class="card" style="margin-bottom:1rem;border-color:var(--g-harm)"><div class="card-head"><h3>Confirm entity matches</h3><span class="muted small">${list.length} to decide</span></div><div class="card-body" style="display:grid;gap:.5rem">
    ${list.map(p => html`<div class="entity-choice" key=${p.id}><span>"<b>${p.imported.name}</b>" (no entity code, from ${p.file}) looks like <b>${session.entities[p.candidate]?.name}</b> <span class="mono small muted">${p.candidate} · ${(p.score * 100).toFixed(0)} %</span></span>
      <span class="sg-row" style="margin:0"><${Button} variant="primary" size="sm" onClick=${() => updateSession(s => resolvePendingEntity(s, p.id, true))}>Same entity – merge</${Button}><${Button} variant="outline" size="sm" onClick=${() => updateSession(s => resolvePendingEntity(s, p.id, false))}>Keep separate</${Button}></span></div>`)}
  </div></div>`;
}

const LEVEL_ORDER = { error: 0, warn: 1, info: 2 };
function WarningList({ warnings }) {
  const [showInfo, setShowInfo] = useState(false);
  const list = warnings.filter(w => showInfo || w.level !== 'info').sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const infos = warnings.filter(w => w.level === 'info').length;
  return html`<div>
    ${!list.length && html`<p class="muted small">No warnings${infos && !showInfo ? ` (${infos} informational)` : ''}.</p>`}
    <div class="wlist">${list.map((w, i) => html`<div class="witem" key=${i}><span class=${`lvl ${w.level}`}>${w.level}</span><div><div>${w.message}</div><div class="f">${w.file}${w.code ? ` · ${w.code}` : ''}</div>${w.examples?.length ? html`<details><summary>${w.examples.length} example${w.examples.length > 1 ? 's' : ''}</summary><pre>${w.examples.map(e => JSON.stringify(e)).join('\n')}</pre></details>` : null}</div></div>`)}</div>
    ${infos > 0 && html`<${Button} variant="text" size="sm" onClick=${() => setShowInfo(!showInfo)}>${showInfo ? 'Hide' : 'Show'} ${infos} informational</${Button}>`}
  </div>`;
}

function FileLayout({ file }) {
  return html`<table class="layout-table"><thead><tr><th>Block</th><th>Entity</th><th>Columns</th><th>Fields → column</th></tr></thead><tbody>
    ${file.layout.blocks.map((b, i) => html`<tr key=${i}><td><b>${b.kind}</b></td><td>${b.entity || html`<span class="muted">shared</span>`}</td><td class="mono">${b.cols}</td><td class="mono">${Object.entries(b.fields).map(([f, c]) => `${f}=${c}`).join('  ') || html`<span class="muted">–</span>`}</td></tr>`)}
  </tbody></table>`;
}

function FilesCard({ session, summary }) {
  const [open, setOpen] = useState(null);
  return html`<${Card} title="Imported files" stats=${[['files', session.files.length]]}>
    <table class="matrix"><thead><tr><th>File</th><th>Main sheet</th><th class="num">Header row</th><th class="num">Entities</th><th class="num">Activities</th><th class="num">Flow sheets</th><th class="num">Warnings</th><th></th></tr></thead><tbody>
      ${session.files.map(f => { const warn = f.warnings.filter(w => w.level !== 'info').length; return html`<tr key=${f.name}><td><b>${f.name}</b><div class="muted small">${f.streams.join(', ')} · ${new Date(f.importedAt).toLocaleString()}</div></td><td>${f.sheet}</td><td class="num">${f.layout.headerRow}</td><td class="num">${f.entities.length}</td><td class="num">${f.activities}</td><td class="num">${f.flowSheets.length}</td><td class=${`num${warn ? ' miss' : ''}`}>${warn}</td><td style="text-align:right"><${Button} variant="text" size="sm" onClick=${() => setOpen(open === f.name ? null : f.name)}>${open === f.name ? 'Hide layout' : 'Layout'}</${Button}></td></tr>${open === f.name && html`<tr><td colspan="8" style="background:var(--bg)"><${FileLayout} file=${f} /></td></tr>`}`; })}
    </tbody></table>
  </${Card}>`;
}

function MatrixCard({ summary }) {
  const streams = summary.streams;
  return html`<${Card} title="Entities × streams" stats=${[['entities', summary.entities.length], ['streams', streams.length]]}>
    <table class="matrix"><thead><tr><th>Entity</th>${streams.map(s => html`<th class="num" key=${s}>${s}</th>`)}<th class="num">Total</th></tr></thead><tbody>
      ${summary.entities.map(e => { const row = summary.matrix[e.code] || {}; const tot = streams.reduce((a, s) => a + (row[s] || 0), 0); return html`<tr key=${e.code}><td>${e.displayName || e.name}${e.hasCode ? html`<span class="ecode">${e.code}</span>` : html`<span class="ecode" title="No entity code in the label">no code</span>`}</td>${streams.map(s => html`<td class=${`num${row[s] ? '' : ' miss'}`} key=${s}>${row[s] || '—'}</td>`)}<td class="num"><b>${tot}</b></td></tr>`; })}
      <tr><td class="muted">Activities in taxonomy</td>${streams.map(s => html`<td class="num muted" key=${s}>${summary.activitiesByStream[s] || 0}</td>`)}<td class="num muted">${Object.values(summary.activitiesByStream).reduce((a, b) => a + b, 0)}</td></tr>
    </tbody></table>
    <p class="sg-note">A dash means the entity has no block in that stream's file – check the entity labels in the band above the header row.</p>
  </${Card}>`;
}

const GAP_ORDER_import = ['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH', 'NA', 'UNCLEAR', 'NOT_ASSESSED'];
function GapCard({ summary }) {
  const total = {}; for (const g of Object.values(summary.gapByStream)) for (const [k, v] of Object.entries(g)) total[k] = (total[k] || 0) + v;
  const segs = (g) => GAP_ORDER_import.map(k => ({ key: k, value: g[k] || 0, label: k === 'NOT_ASSESSED' ? 'Not assessed' : GAP_LABEL[k] }));
  const n = (g) => Object.values(g).reduce((a, b) => a + b, 0);
  return html`<${Card} title="Pre-assessment by GBS Operations · gap distribution" stats=${[['in scope', n(total)], ['out of scope', summary.outOfScope]]}>
    <${Stack} size="lg" segments=${segs(total)} />
    <div style="margin-top:.9rem">${summary.streams.map(s => html`<div class="inline-stack" key=${s}><b class="mono">${s}</b><${Stack} segments=${segs(summary.gapByStream[s] || {})} legend=${false} /><span class="num muted small" style="text-align:right">${n(summary.gapByStream[s] || {})}</span></div>`)}</div>
    <p class="sg-note">UNCLEAR = value present but not mappable ("?" or unknown text); Not assessed = empty GAP cell. Both are discussed in the workshop.</p>
  </${Card}>`;
}

function DiffsCard({ session }) {
  const d = session.importDiffs; if (!d.length) return null;
  return html`<${Card} title="Ops values changed by re-import" stats=${[['changes', d.length]]}>
    <table class="matrix"><thead><tr><th>Entity</th><th>Process</th><th>Field</th><th>Old</th><th>New</th><th>File</th></tr></thead><tbody>
      ${d.slice(0, 50).map(x => html`<tr key=${x.id}><td>${session.entities[x.entityCode]?.name || x.entityCode}</td><td class="mono">${x.processId}</td><td class="mono">${x.field}</td><td style="text-align:left">${String(x.old ?? '—')}</td><td style="text-align:left"><b>${String(x.new ?? '—')}</b></td><td class="muted small" style="text-align:left">${x.file}</td></tr>`)}
    </tbody></table>${d.length > 50 && html`<p class="sg-note">Showing the first 50 of ${d.length}.</p>`}
  </${Card}>`;
}

function ImportView({ session, summary, updateSession, toast, onClearAll, onReplaceSession }) {
  const profiles = allProfiles(session); const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID); const profileRef = useRef(null);
  profileRef.current = profiles.find(p => p.id === profileId) || null;
  const dz = { profiles, profileId, setProfileId };
  const q = useImportQueue(updateSession, (results, n) => {
    const ok = results.filter(r => r && !r.error); const added = ok.reduce((a, r) => a + r.assessments.added, 0), merged = ok.reduce((a, r) => a + r.assessments.merged, 0), changed = ok.reduce((a, r) => a + r.assessments.changedOps, 0);
    const pending = results.length - ok.length;
    toast(`${ok.length} of ${n} file${n > 1 ? 's' : ''} imported · ${added} assessments added${merged ? `, ${merged} merged` : ''}${changed ? `, ${changed} Ops values changed` : ''}${pending ? ` · ${pending} need attention` : ''}`);
  }, profileRef);
  const [confirmClear, setConfirmClear] = useState(false);
  const hasData = session.files.length > 0;
  const onFiles = (files) => q.run(files);
  if (!hasData && !q.jobs.length) {
    return html`<div>
      <${PageHead} eyebrow="2 · Workshop · files & exports" title="Import the capture sheets" lead="Start with the pre-filled workbooks from GBS Operations. The tool reads the main Fit-Gap sheet of each file, detects entities and blocks by their titles, and shows you exactly what it found before anything is assessed." how=${html`<ol><li>Drop all stream workbooks at once (or add them one by one).</li><li>Check the import summary: entities × streams, activity counts, gap distribution and warnings.</li><li>If a label without entity code looks like a known entity, confirm or reject the match.</li><li>Re-import a newer version at any time – Ops values are refreshed and listed, workshop results stay.</li></ol>`} />
      <${DropZone} onFiles=${onFiles} ...${dz} />
      <div style="margin-top:1rem;max-width:46rem"><${ExportsCard} session=${session} summary=${summary} updateSession=${updateSession} toast=${toast} onReplaceSession=${onReplaceSession} /></div>
    </div>`;
  }
  return html`<div>
    <${PageHead} eyebrow="2 · Workshop · files & exports" title=${hasData ? `${summary.entities.length} entities · ${summary.streams.length} streams · ${summary.assessments} assessments` : 'Importing…'} lead="What was read from the capture sheets. Check that every entity appears in every stream, then go to the workshop." />
    <${PendingEntities} session=${session} updateSession=${updateSession} />
    ${hasData && html`<div class="kpi-row"><${Kpi} value=${summary.entities.length} label="Entities" /><${Kpi} value=${Object.values(summary.activitiesByStream).reduce((a, b) => a + b, 0)} label="L4 activities" color="var(--gbs)" /><${Kpi} value=${summary.assessments} label="Entity × activity" color="var(--auto)" /><${Kpi} value=${summary.outOfScope} label="Out of scope" color="var(--g-oos)" /><${Kpi} value=${summary.warnings.filter(w => w.level !== 'info').length} label="Warnings" color=${summary.warnings.some(w => w.level === 'error') ? 'var(--flag)' : 'var(--g-harm)'} /></div>`}
    <div class="import-grid">
      <div style="display:grid;gap:1rem">
        ${hasData && html`<${MatrixCard} summary=${summary} />`}
        ${hasData && html`<${GapCard} summary=${summary} />`}
        <${DiffsCard} session=${session} />
      </div>
      <div style="display:grid;gap:1rem">
        <${ExportsCard} session=${session} summary=${summary} updateSession=${updateSession} toast=${toast} onReplaceSession=${onReplaceSession} />
        <${DropZone} onFiles=${onFiles} compact ...${dz} />
        ${q.jobs.length > 0 && html`<div class="filelist">${q.jobs.map(j => html`<${JobRow} key=${j.id} job=${j} onChoose=${q.choose} />`)}</div>`}
        ${hasData && html`<${FilesCard} session=${session} summary=${summary} />`}
        ${hasData && summary.warnings.some(w => w.level !== 'info') && html`<${Card} title="Things to check in the files" stats=${[['open', summary.warnings.filter(w => w.level !== 'info').length]]}><${WarningList} warnings=${summary.warnings} /></${Card}>`}
        <details class="disclosure"><summary>Advanced: template profiles, parser details <${Icon} name="chevron" size=${14} /></summary><div class="body" style="max-width:none;padding:0;border:0;background:none"><div style="display:grid;gap:1rem;margin-top:.6rem">${hasData && !summary.warnings.some(w => w.level !== 'info') && html`<${Card} title="Parser notes"><${WarningList} warnings=${summary.warnings} /></${Card}>`}<${ProfilesCard} session=${session} updateSession=${updateSession} toast=${toast} /></div></div></details>
        ${hasData && html`<div class="sg-row" style="justify-content:flex-end">${confirmClear ? html`<span class="small muted">Remove all imported data and workshop results from this browser?</span><${Button} variant="danger" size="sm" onClick=${() => { setConfirmClear(false); q.clear(); onClearAll(); }}>Yes, clear everything</${Button}><${Button} variant="text" size="sm" onClick=${() => setConfirmClear(false)}>Cancel</${Button}>` : html`<${Button} variant="text" size="sm" onClick=${() => setConfirmClear(true)}>Clear all data</${Button}>`}</div>`}
      </div>
    </div>
  </div>`;
}
