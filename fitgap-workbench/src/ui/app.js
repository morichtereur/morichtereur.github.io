// App shell: sidebar (streams + six lifecycle phases), top bar, KPI strip, pages.
const PHASES = [
  { n: 1, key: 'plan', label: 'Plan', icon: 'plan', increment: 2, title: 'Plan the country fit-gap', what: ['Portfolio of countries from the planning workbook ("Fit Gap Workshops"), one country active at a time', 'Country set-up: entities, streams and sub-streams in scope (R2R, A2R-FAA, A2R-IA, I2P, I2C, ICO, MD)', 'Participant list (Local, GBS Ops, Transition, Process Expert) – owner fields pick from it', 'Session list: date, time slot, stream or MD, participants, recording – every change in RUN is tagged with the active session', 'Later: week calendar grid, effort estimate per session, agenda / .ics export, milestones'] },
  { n: 2, key: 'prepare', label: 'Prepare', icon: 'prepare', increment: 10, title: 'Readiness per session', what: ['Checklist per session: capture sheet received, Ops pre-assessment complete (% As-Is filled), flows available, participants nominated, room / link sent', 'Traffic light per session and a list of missing pre-fills to chase with GBS Ops'] },
  { n: 3, key: 'run', label: 'Run', icon: 'run', increment: 1, title: 'Workshop mode', what: ['Import of the stream workbooks (template profile #1) with the import summary: files, entities × streams, activity counts, gap distribution, parsing warnings', 'One row per L4 activity, entity columns side by side; exception-based flow per L3 with "Confirm Ops NO GAP" in bulk', 'Fit-Gap toggles + FTE, Detailed Gap fields with quick-pick chips, workshop gap type + rationale, deviation block', 'Audit trail of every change, feedback button, session timer, keyboard-first entry'] },
  { n: 4, key: 'evaluate', label: 'Evaluate', icon: 'evaluate', increment: 7, title: 'Evaluate outcomes & decide gap treatment', what: ['All deviations across entities and streams on one board, grouped by resolution approach', 'Status workflow Proposed → Aligned → Approved; escalation queue per level (L1 … SteerCo)', 'Activity split view and gap analysis dashboard (Ops vs. workshop, change matrix, heatmap, cross-entity view, gap drivers)'] },
  { n: 5, key: 'qg2', label: 'QG2 sign-off', icon: 'qg2', increment: 6, title: 'Quality Gate 2 readiness', what: ['Per entity and stream: % assessed, deviations by resolution approach, deviations without owner / justification / approval, open questions', 'Sign-off fields Process Expert and GBS Operations per stream', 'A stream is QG2-ready only when all activities are assessed and every deviation has owner, approach and approval status'] },
  { n: 6, key: 'handover', label: 'Hand-over', icon: 'handover', increment: 10, title: 'Hand-over package', what: ['Approved deviation log, separate-variant list (input for DTPs), initiative candidates (PE / WP3), taxonomy change requests, QG2 sign-off summary', 'Write-back of workshop results into the original workbooks (values only, formatting preserved)'] },
];

function applyTheme(theme) { if (theme) document.documentElement.setAttribute('data-theme', theme); else document.documentElement.removeAttribute('data-theme'); }

function Sidebar({ phase, setPhase, summary, rail, setRail, session, page, setPage }) {
  const counts = summary.activitiesByStream || {};
  const hasData = Object.keys(session.processes).length > 0;
  return html`<aside class="sidebar">
    <div class="side-brand"><span class="mark">FG</span><div style="min-width:0"><div class="name">GBS Fit-Gap Workbench</div><div class="client">${session.settings.clientName ? `${session.settings.clientName} · ${session.settings.country}` : 'No client loaded'}</div></div></div>
    <div class="side-section"><div class="eyebrow">Streams</div>
      ${STREAMS.map(s => { const inScope = s !== 'A2R' ? session.settings.streamsInScope[s] !== false : (session.settings.streamsInScope['A2R-FAA'] || session.settings.streamsInScope['A2R-IA']); const g = summary.gapByStream?.[s] || {}; const segs = ['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH', 'NA', 'UNCLEAR'].map(k => ({ key: k, value: g[k] || 0 })); const tot = segs.reduce((a, b) => a + b.value, 0) || 1;
        return html`<button class=${`side-stream${inScope ? '' : ' off'}`} key=${s}><div class="row"><span>${s}</span><span class="num">${hasData ? (counts[s] || 0) : '—'}</span></div><div class="bar">${segs.filter(x => x.value).map(x => html`<i class=${`c-${x.key}`} style=${`width:${100 * x.value / tot}%`}></i>`)}</div></button>`; })}
    </div>
    <div class="side-section" style="padding-bottom:.25rem"><div class="eyebrow">Lifecycle</div></div>
    <nav class="side-nav" aria-label="Phases">
      ${PHASES.map(p => html`<button class="side-nav-item" aria-current=${page === 'phase' && phase === p.key ? 'page' : 'false'} onClick=${() => { setPage('phase'); setPhase(p.key); }}><span class="n">${p.n}</span><span>${p.label}</span>${p.increment !== 1 ? html`<span class="state">next</span>` : html`<span class="state">build</span>`}</button>`)}
    </nav>
    <div class="side-footer">
      <button class="side-nav-item" aria-current=${page === 'styleguide' ? 'page' : 'false'} onClick=${() => setPage('styleguide')}><${Icon} name="palette" /><span>Style sheet</span></button>
      <button class="side-nav-item" onClick=${() => setRail(!rail)}><${Icon} name="sidebar" /><span>Collapse</span></button>
      <div class="side-version">v${BUILD.version} · ${BUILD.builtAt.slice(0, 10)} · offline</div>
    </div>
  </aside>`;
}

function TopBar({ crumbs, theme, setTheme, share, setShare, onPalette, onFeedback }) {
  return html`<header class="topbar">
    <div class="crumb">${crumbs.map((c, i) => html`${i > 0 && html`<span class="sep">›</span>`}${i === crumbs.length - 1 ? html`<b>${c}</b>` : html`<span>${c}</span>`}`)}</div>
    <div class="search" role="button" tabindex="0" onClick=${onPalette} onKeyDown=${e => e.key === 'Enter' && onPalette()}><${Icon} name="search" size=${14} />Jump to entity, stream, process ID or activity<kbd>Ctrl K</kbd></div>
    <div class="actions">
      <span class="saved"><span class="dot"></span>Saved</span>
      <${IconButton} icon="feedback" label="Feedback" onClick=${onFeedback} />
      <${IconButton} icon="share" label=${share ? 'Screen-share mode on' : 'Screen-share mode'} onClick=${() => setShare(!share)} style=${share ? 'color:var(--accent)' : ''} />
      <${IconButton} icon="undo" label="Undo" disabled />
      <${IconButton} icon="redo" label="Redo" disabled />
      <${IconButton} icon=${theme === 'dark' ? 'sun' : 'moon'} label="Toggle theme" onClick=${() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
    </div>
  </header>`;
}

function KpiStrip({ summary, session }) {
  const total = summary.assessments || 0;
  if (!total) return html`<div class="kpi-strip"><div class="headline"><b>0</b> activities loaded</div><div class="muted small">Import the stream capture sheets to see the headline KPI and gap mix here.</div></div>`;
  const g = {}; for (const s of Object.values(summary.gapByStream)) for (const [k, v] of Object.entries(s)) g[k] = (g[k] || 0) + v;
  const segs = ['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH', 'NA', 'UNCLEAR', 'NOT_ASSESSED'].map(k => ({ key: k, value: g[k] || 0, label: GAP_LABEL[k] || 'Not assessed' }));
  const pct = Math.round(100 * (g.NO_GAP || 0) / Math.max(1, total - summary.outOfScope));
  return html`<div class="kpi-strip"><div class="headline"><b>${pct}%</b> Ops NO GAP · ${session.settings.clientName || summary.entities.length + ' entities'}</div><${Stack} segments=${segs} legend=${true} /></div>`;
}

function ComingNext({ p }) {
  return html`<div class="coming">
    <${PageHead} eyebrow=${`${p.n} · ${p.label} · coming next (increment ${p.increment})`} title=${p.title} lead="This phase is part of the lifecycle shell from day one. It is not built yet – here is what it will contain." how=${html`<p>Phases are built in the order of the pilot plan: RUN first (import, workshop mode, audit trail), then save/load and exports, then present mode, QG2, EVALUATE and the full PLAN / PREPARE / HAND-OVER.</p>`} />
    <div class="card"><div class="card-body"><div class="eyebrow" style="margin-bottom:.5rem">Planned content</div><ul>${p.what.map(w => html`<li>${w}</li>`)}</ul></div></div>
  </div>`;
}

function Palette({ open, onClose, items, onPick }) {
  const ref = useRef(); const [q, setQ] = useState(''); const [sel, setSel] = useState(0);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) { d.showModal(); setQ(''); setSel(0); } if (!open && d.open) d.close(); }, [open]);
  const list = items.filter(i => !q || i.label.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  const key = (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(sel + 1, list.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(sel - 1, 0)); } if (e.key === 'Enter' && list[sel]) { onPick(list[sel]); } };
  return html`<dialog ref=${ref} class="palette" onClose=${onClose} onClick=${e => e.target === ref.current && onClose()}>
    <input class="input" placeholder="Jump to…" value=${q} onInput=${e => { setQ(e.target.value); setSel(0); }} onKeyDown=${key} autofocus />
    <ul role="listbox">${list.map((i, idx) => html`<li role="option" aria-selected=${idx === sel} onClick=${() => onPick(i)}><${Icon} name=${i.icon || 'file'} size=${14} />${i.label}<span class="k">${i.kind}</span></li>`)}${!list.length && html`<li class="muted">No match</li>`}</ul>
  </dialog>`;
}

function Welcome({ open, onClose, onPrimary }) {
  const ref = useRef();
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); else if (!open && d.open) d.close(); }, [open]);
  return html`<dialog ref=${ref} onClose=${onClose}><div class="dlg-body"><div class="eyebrow" style="margin-bottom:.4rem">GBS Fit-Gap Workbench · v${BUILD.version}</div><h2>Plan, run and sign off a country fit-gap – offline, in one file.</h2><p class="muted">This build is increment 0: the lifecycle shell, the design system and the capture-sheet parser are in place for review. Workshop mode and import follow once the data model is confirmed.</p></div><div class="dlg-actions"><${Button} variant="text" onClick=${onClose}>Close</${Button}><${Button} variant="primary" icon="palette" onClick=${onPrimary}>Open the style sheet</${Button}></div></dialog>`;
}

function FeedbackPanel({ open, onClose, onSave, view }) {
  const [note, setNote] = useState('');
  if (!open) return null;
  return html`<div class="popover card"><div class="card-head"><h3>Feedback · ${view}</h3><${IconButton} icon="x" label="Close" onClick=${onClose} /></div><div class="card-body"><${Field} label="What should change?" hint="Logged into the session file as pilot improvement backlog."><textarea class="textarea" value=${note} onInput=${e => setNote(e.target.value)} autofocus></textarea></${Field}><div class="sg-row" style="justify-content:flex-end;margin:.7rem 0 0"><${Button} variant="primary" size="sm" disabled=${!note.trim()} onClick=${() => { onSave(note.trim()); setNote(''); onClose(); }}>Log feedback</${Button}></div></div></div>`;
}

function App() {
  const [session, setSession] = useState(() => createSession());
  const [page, setPage] = useState(() => store.get('fg.page', 'phase'));
  const [phase, setPhase] = useState(() => store.get('fg.phase', 'run'));
  const [theme, setThemeState] = useState(() => store.get('fg.theme', null));
  const [share, setShareState] = useState(false);
  const [rail, setRail] = useState(false);
  const [palette, setPalette] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [welcome, setWelcome] = useState(() => !store.get('fg.welcomed', false));
  const [toasts, setToasts] = useState([]);
  const summary = useMemo(() => importSummary(session), [session]);
  const setTheme = (t) => { setThemeState(t); store.set('fg.theme', t); applyTheme(t); };
  const setShare = (v) => { setShareState(v); document.documentElement.setAttribute('data-share', v ? 'on' : 'off'); };
  useEffect(() => { applyTheme(theme); }, []);
  useEffect(() => { store.set('fg.page', page); store.set('fg.phase', phase); }, [page, phase]);
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const toast = (text, opts = {}) => { const id = newId('t'); setToasts(t => [...t, { id, text, ...opts }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), opts.ttl || 4000); };
  const current = PHASES.find(p => p.key === phase) || PHASES[2];
  const viewName = page === 'styleguide' ? 'Style sheet' : `${current.n} ${current.label}`;
  const crumbs = page === 'styleguide' ? ['Design system', 'Style sheet'] : [`${current.n} ${current.label}`, current.title];
  const paletteItems = [...PHASES.map(p => ({ label: `${p.n} ${p.label} – ${p.title}`, kind: 'phase', icon: p.icon, go: () => { setPage('phase'); setPhase(p.key); } })), { label: 'Style sheet', kind: 'design', icon: 'palette', go: () => setPage('styleguide') }, { label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', kind: 'theme', icon: 'sun', go: () => setTheme(theme === 'dark' ? 'light' : 'dark') }];
  const logFeedback = (note) => { setSession(s => ({ ...s, feedback: [...s.feedback, { ts: new Date().toISOString(), view: viewName, note, sessionId: s.activeSessionId }] })); toast('Feedback logged'); };
  return html`<div class="app" data-rail=${rail ? '1' : '0'}>
    <${Sidebar} phase=${phase} setPhase=${setPhase} summary=${summary} rail=${rail} setRail=${setRail} session=${session} page=${page} setPage=${setPage} />
    <div class="content">
      <${TopBar} crumbs=${crumbs} theme=${theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')} setTheme=${setTheme} share=${share} setShare=${setShare} onPalette=${() => setPalette(true)} onFeedback=${() => setFeedback(f => !f)} />
      <${KpiStrip} summary=${summary} session=${session} />
      <main class="main">${page === 'styleguide' ? html`<${StyleGuide} />` : html`<${ComingNext} p=${current} />`}</main>
    </div>
    <${Palette} open=${palette} onClose=${() => setPalette(false)} items=${paletteItems} onPick=${i => { setPalette(false); i.go(); }} />
    <${Welcome} open=${welcome} onClose=${() => { setWelcome(false); store.set('fg.welcomed', true); }} onPrimary=${() => { setWelcome(false); store.set('fg.welcomed', true); setPage('styleguide'); }} />
    <${FeedbackPanel} open=${feedback} onClose=${() => setFeedback(false)} onSave=${logFeedback} view=${viewName} />
    <div class="toasts">${toasts.map(t => html`<${Toast} key=${t.id} text=${t.text} actionLabel=${t.actionLabel} onAction=${t.onAction} />`)}</div>
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
