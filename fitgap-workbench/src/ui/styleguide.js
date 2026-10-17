// One-page style sheet: tokens + every component, for review before screens are built.
const SG_ENTITIES = [['301001', 'Demo France SAS'], ['301002', 'Demo Pharma France SAS'], ['301003', 'Demo Logistics SARL']];

function SgSection({ title, note, children }) { return html`<section class="sg-section"><h2>${title}</h2>${note && html`<p class="muted">${note}</p>`}${children}</section>`; }

function Swatches() {
  const groups = [
    ['Surfaces & ink', ['--bg', '--panel', '--line', '--line-strong', '--ink', '--ink-2', '--accent', '--accent-2', '--accent-soft', '--flag', '--flag-soft', '--ok']],
    ['Lanes (activity split)', ['--gbs', '--local', '--split', '--coe', '--auto', '--none']],
    ['Gap types (colour-blind safe, always with label)', ['--g-none', '--g-harm', '--g-std', '--g-both', '--g-na', '--g-unclear', '--g-oos']],
    ['Sidebar', ['--side', '--side-2', '--side-ink', '--side-ink-2', '--side-accent']],
  ];
  const cs = getComputedStyle(document.documentElement);
  return groups.map(([g, vars]) => html`<div style="margin-bottom:.9rem"><div class="eyebrow" style="margin-bottom:.4rem">${g}</div><div class="sg-grid">${vars.map(v => html`<div class="swatch"><i style=${`background:var(${v})`}></i><div>${v}<code>${cs.getPropertyValue(v).trim()}</code></div></div>`)}</div></div>`);
}

function SgWorkshopRow() {
  const [open, setOpen] = useState(true);
  const [fit, setFit] = useState({ local: true, other: null, gbs: false });
  const [chips, setChips] = useState(['SAP']);
  const toggleChip = (c) => setChips(chips.includes(c) ? chips.filter(x => x !== c) : [...chips, c]);
  return html`<table class="wtable" style="font-size:.84rem">
    <thead><tr><th style="width:34%">Activity</th>${SG_ENTITIES.map(([c, n]) => html`<th class="ent">${n}<small>${c}</small></th>`)}</tr></thead>
    <tbody>
      <tr class="act" aria-selected="true" onClick=${() => setOpen(!open)}>
        <td><div class="pid">R2R 2.1.1.3</div><div class="aname">Post recurring journal entries</div><div class="ctx">To-Be: <${Tag} kind="GBS" /> SAP · Ops: <${GapPill} value="NO_GAP" size="sm" /> "Manual upload in Excel"</div></td>
        <td class="ent"><div class="cell"><div class="top"><${GapPill} value="HARMONIZATION" size="sm" /><span class="diff-note">Ops: NO GAP</span></div><div class="tri"><span class="lbl">LA</span><${YN} size="sm" value=${fit.local} onChange=${v => setFit({ ...fit, local: v })} name="Local Accounting" /><span class="lbl">OT</span><${YN} size="sm" value=${fit.other} onChange=${v => setFit({ ...fit, other: v })} name="Other" /><span class="lbl">GBS</span><${YN} size="sm" value=${fit.gbs} onChange=${v => setFit({ ...fit, gbs: v })} name="GBS" /></div><${StatusDot} status="CHANGED_VS_OPS" /></div></td>
        <td class="ent"><div class="cell"><div class="top"><${GapPill} value="NO_GAP" size="sm" /></div><div class="tri"><span class="lbl">LA</span><${YN} size="sm" value=${false} onChange=${() => {}} name="Local Accounting" /><span class="lbl">OT</span><${YN} size="sm" value=${false} onChange=${() => {}} name="Other" /><span class="lbl">GBS</span><${YN} size="sm" value=${true} onChange=${() => {}} name="GBS" /></div><${StatusDot} status="CONFIRMED_FIT" /></div></td>
        <td class="ent"><div class="cell"><div class="top"><${GapPill} value="NOT_ASSESSED" size="sm" /></div><div class="tri"><span class="lbl">LA</span><${YN} size="sm" value=${null} onChange=${() => {}} name="Local Accounting" /><span class="lbl">OT</span><${YN} size="sm" value=${null} onChange=${() => {}} name="Other" /><span class="lbl">GBS</span><${YN} size="sm" value=${null} onChange=${() => {}} name="GBS" /></div><${StatusDot} status="NOT_ASSESSED" /></div></td>
      </tr>
      ${open && html`<tr class="expand"><td colspan="4"><div class="expand-inner">
        <div class="block"><h4><span class="step">1</span> Fit-Gap · Demo France SAS</h4>
          <div class="fgrid"><${Field} label="Local Accounting"><${YN} value=${fit.local} onChange=${v => setFit({ ...fit, local: v })} name="Local Accounting" /></${Field}><${Field} label="FTE"><input class="input num sm" value="0.4" /></${Field}>
          <${Field} label="Workshop gap type" required><select class="select sm"><option>HARMONIZATION GAP</option><option>NO GAP</option><option>STANDARDIZATION GAP</option><option>BOTH GAPS</option></select></${Field}>
          <${Field} label="Rationale" required error="Required when the gap type differs from Ops"><input class="input sm invalid" placeholder="Why does this differ from the Ops pre-assessment?" /></${Field}></div>
          <div class="diff-note" style="margin-top:.4rem">To-Be: GBS → Workshop: Local — harmonization gap suggested</div></div>
        <div class="block"><h4><span class="step">2</span> Detailed Gap</h4>
          <div class="fgrid"><${Field} label="IT Systems"><div class="chips">${['SAP', 'SNOW', 'Blackline', 'Excel'].map(c => html`<${Chip} active=${chips.includes(c)} onClick=${() => toggleChip(c)}>${c}</${Chip}>`)}<${Chip} na>n/a</${Chip}></div></${Field}>
          <${Field} label="Workflow Tools"><div class="chips"><${Chip}>SNOW</${Chip}><${Chip}>Email</${Chip}><${Chip} na active>n/a</${Chip}></div></${Field}>
          <${Field} label="Legal / Regulatory" hint="French GAAP: FEC file required"><input class="input sm" value="FEC export at year end" /></${Field}>
          <${Field} label="Language requirements"><input class="input sm" placeholder="e.g. French for tax authority correspondence" /></${Field}></div>
          <div class="sg-row" style="margin-top:.6rem"><${Button} variant="outline" size="sm" icon="copy">Copy from previous activity</${Button}><${Button} variant="text" size="sm">Mark all n/a</${Button}></div></div>
        <div class="block"><h4><span class="step">3</span> Deviation</h4>
          <div class="fgrid"><${Field} label="Dimension" required><div class="chips"><${Chip} active>Business</${Chip}><${Chip}>IT Systems</${Chip}><${Chip} active>Legal</${Chip}></div></${Field}>
          <${Field} label="Resolution approach" required><select class="select sm"><option>Separate variant</option><option>Close before go-live</option><option>Lift & shift</option></select></${Field}>
          <${Field} label="Accountable owner" required><select class="select sm"><option>M. Dupont · Local</option><option>A. Weber · GBS Ops</option></select></${Field}>
          <${Field} label="Escalation level"><select class="select sm"><option>L1 Transition Manager</option><option>L2 QG Committee</option><option>L3 Project Leadership</option><option>SteerCo</option></select></${Field}>
          <${Field} label="Justification" required><textarea class="textarea" style="min-height:3rem">Statutory FEC format mandated by French tax code.</textarea></${Field}></div></div>
      </div></td></tr>`}
    </tbody></table>`;
}

function StyleGuide() {
  const [toast, setToast] = useState(true);
  const defs = GAP_DEFINITIONS;
  return html`<div>
    <${PageHead} eyebrow="Design system · Splitfold consulting edition" title="Style sheet" lead="Tokens and every component the workbench is built from, in the current theme. Toggle the theme in the top bar to review dark mode; toggle screen-share mode for the projector variant."
      how=${html`<p>This page is the design contract for all screens. Components here are live – click toggles, chips and rows. Nothing on this page is client data.</p>`} />

    <${SgSection} title="1 · Colour tokens" note="Light and dark palettes from Splitfold. Gap types have their own palette so they never collide with lane colours."><${Swatches} /></${SgSection}>

    <${SgSection} title="2 · Typography" note="Instrument Sans for UI, Source Serif 4 for page titles and big headings, IBM Plex Mono for IDs and numbers. All three embedded as woff2 – no network.">
      <div class="type-sample"><span class="eyebrow">Page title · serif</span><h1>Which end-to-end process are you working on?</h1></div>
      <div class="type-sample"><span class="eyebrow">Section · sans 600</span><h2>Journal Entries · 18 activities</h2></div>
      <div class="type-sample"><span class="eyebrow">Body</span><p style="margin:0;max-width:40rem">Fit-gap workshops run per country and per process, assessing deviations from the global standard along three dimensions: Business, IT Systems, Legal.</p></div>
      <div class="type-sample"><span class="eyebrow">Eyebrow</span><span class="eyebrow">Process flow · Master data maintenance</span></div>
      <div class="type-sample"><span class="eyebrow">Mono · IDs, numbers</span><span class="mono">R2R 2.1.1.3 · 301001 · 0.40 FTE · 62 %</span></div>
    </${SgSection}>

    <${SgSection} title="3 · Buttons & links" note="One filled accent button per screen. Outlined for secondary, underlined text links for tertiary, icon buttons in bars.">
      <div class="sg-row"><${Button} variant="primary" icon="upload">Import capture sheets</${Button}><${Button} variant="primary" kbd="C">Confirm as fit</${Button}><${Button} variant="outline">Save session</${Button}><${Button} variant="outline" size="sm" icon="copy">Copy from previous</${Button}><${Button} variant="text">Export audit trail</${Button}><${Button} variant="danger" size="sm">Discard</${Button}><${Button} variant="primary" disabled>Disabled</${Button}><${IconButton} icon="sun" label="Theme" /><${IconButton} icon="undo" label="Undo" /><${IconButton} icon="redo" label="Redo" disabled /></div>
    </${SgSection}>

    <${SgSection} title="4 · Pills, tags, status" note="Gap types as colour-coded pills everywhere (badge, swimlane, heatmap, charts) – one palette, label text always present, tooltip carries the definition.">
      <div class="sg-row">${['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH', 'NA', 'UNCLEAR', 'OUT_OF_SCOPE', 'NOT_ASSESSED'].map(g => html`<${GapPill} value=${g} definitions=${defs} />`)}</div>
      <div class="sg-row"><${GapPill} value="HARMONIZATION" size="sm" /><${GapPill} value="HARMONIZATION" /><${GapPill} value="HARMONIZATION" size="lg" /></div>
      <div class="sg-row"><${Tag} kind="GBS" /><${Tag} kind="LOCAL" /><${Tag} kind="MIXED" /><${Tag} kind="OTHER" /><${Tag} kind="AUTO" /><${Tag} kind="NONE">none</${Tag}></div>
      <div class="sg-row">${Object.keys(WORKSHOP_STATUS_LABEL).map(s => html`<${StatusDot} status=${s} />`)}</div>
      <div class="sg-row"><span class="diff">Workshop differs from Ops pre-assessment → blue edge + note</span><span class="diff-note">Ops: NO GAP → Workshop: HARMONIZATION</span></div>
    </${SgSection}>

    <${SgSection} title="5 · Inputs, toggles, chips" note="Y/N toggles are tri-state (Y / N / not set). Chips are quick-picks for frequent values – systems already used in the file – with n/a as one click.">
      <div class="sg-two">
        <div class="fgrid"><${Field} label="Client name"><input class="input" placeholder="From the imported files" /></${Field}><${Field} label="Country" required><input class="input" value="France" /></${Field}>
          <${Field} label="Stream"><select class="select"><option>R2R</option><option>A2R – FAA</option><option>A2R – IA</option><option>I2P</option><option>I2C</option><option>ICO</option><option>MD</option></select></${Field}>
          <${Field} label="FTE" hint="Decimal, comma or point"><input class="input num" value="0,5" /></${Field}>
          <${Field} label="Rationale" required error="Required for any gap type other than NO GAP"><input class="input invalid" /></${Field}>
          <${Field} label="Comment" class="full"><textarea class="textarea" placeholder="Enter opens the comment field"></textarea></${Field}></div>
        <div>
          <div class="sg-row"><span class="small muted">Fit-Gap toggles</span><${YN} value=${true} onChange=${() => {}} name="Local" /><${YN} value=${false} onChange=${() => {}} name="Other" /><${YN} value=${null} onChange=${() => {}} name="GBS" /><${YN} size="sm" value=${true} onChange=${() => {}} name="small" /></div>
          <div class="sg-row"><span class="small muted">Quick-pick chips</span><div class="chips"><${Chip} active>SAP</${Chip}><${Chip}>SNOW</${Chip}><${Chip}>Blackline</${Chip}><${Chip}>Concur</${Chip}><${Chip} na>n/a</${Chip}></div></div>
          <div class="sg-row"><span class="small muted">Scope switches</span><${Switch} checked=${true} onChange=${() => {}}>A2R – FAA in scope</${Switch}><${Switch} checked=${false} onChange=${() => {}}>A2R – IA in scope</${Switch}></div>
          <div class="sg-row"><span class="small muted">Keyboard</span><span class="mono small">↑ ↓ next activity · Tab fields · 1–5 status · Enter comment · C confirm as fit · Ctrl K palette</span></div>
        </div>
      </div>
    </${SgSection}>

    <${SgSection} title="6 · Workshop table row" note="One row per L4 activity, entity columns side by side. Row expands inline (no modal) into Fit-Gap → Detailed Gap → Deviation. Click the row to collapse/expand.">
      <${SgWorkshopRow} />
      <p class="sg-note">Column widths: activity 34 %, remaining split evenly across entities (3–4). On narrow screens the single-entity focus view is used instead.</p>
    </${SgSection}>

    <${SgSection} title="7 · KPI row, issue counters, block card" note="Large mono number + uppercase label + coloured left bar; outlined counters for things to resolve; collapsible card per L2 with header stats.">
      <div class="kpi-row"><${Kpi} value="62" unit="%" label="Confirmed fit" color="var(--ok)" /><${Kpi} value="168" unit="· 79 %" label="GBS" color="var(--gbs)" /><${Kpi} value="31" label="Deviations" color="var(--g-harm)" /><${Kpi} value="7" label="Open questions" color="var(--g-unclear)" /></div>
      <div class="issues" style="margin-bottom:1rem"><${IssueCounter} n="3" label="where Ops and workshop disagree" /><${IssueCounter} n="2" label="deviations without owner" flag /><${IssueCounter} n="5" label="missing Detailed Gap fields" /></div>
      <${Card} title="R2R 2 · Period-End Close" stats=${[['activities', 24], ['done', '18'], ['open gaps', 4]]} onToggle=${() => {}} actions=${html`<${Button} variant="outline" size="sm">Confirm Ops NO GAP for this L3</${Button}>`}>
        <table style="width:100%;border-collapse:collapse;font-size:.84rem">
          ${[['R2R 2.1.1', 'Accruals & provisions', 'GBS', 'NO_GAP', [['NO_GAP', 7], ['HARMONIZATION', 1]], '88 %'], ['R2R 2.1.2', 'Intercompany reconciliation', 'MIXED', 'HARMONIZATION', [['NO_GAP', 3], ['HARMONIZATION', 4], ['BOTH', 1]], '38 %'], ['R2R 2.1.3', 'Closing journal review', 'LOCAL', 'STANDARDIZATION', [['NO_GAP', 2], ['STANDARDIZATION', 3]], '40 %']].map(([id, n, lane, g, segs, pct]) => html`<tr style="border-bottom:1px solid var(--line)"><td style="padding:.45rem .3rem" class="pid">${id}</td><td style="padding:.45rem .3rem">${n}</td><td style="padding:.45rem .3rem"><${Tag} kind=${lane} /></td><td style="padding:.45rem .3rem"><${GapPill} value=${g} size="sm" /></td><td style="padding:.45rem .3rem"><${MiniBar} segments=${segs.map(([key, value]) => ({ key, value }))} pct=${pct} /></td><td style="padding:.45rem .3rem;text-align:right"><select class="select sm" style="width:auto"><option>Walk all</option><option>Exceptions only</option></select></td></tr>`)}
        </table>
      </${Card}>
    </${SgSection}>

    <${SgSection} title="8 · Stacked bars & sidebar progress" note="Full-width bar with legend in the sticky KPI strip; thin bar under each stream in the sidebar; mini bar with % inside table rows.">
      <${Stack} size="lg" segments=${[{ key: 'NO_GAP', value: 212, label: 'NO GAP' }, { key: 'HARMONIZATION', value: 61, label: 'HARMONIZATION' }, { key: 'STANDARDIZATION', value: 24, label: 'STANDARDIZATION' }, { key: 'BOTH', value: 9, label: 'BOTH' }, { key: 'NA', value: 11, label: 'N/A' }, { key: 'NOT_ASSESSED', value: 40, label: 'Not assessed' }]} />
    </${SgSection}>

    <${SgSection} title="9 · Process flow board (entity swimlane)" note="Lanes as rows, numbered step columns, step cards with a coloured top border by lane, hatched empty cells, hand-off markers. A responsibility view, not a BPMN replacement.">
      <div class="board"><table>
        <thead><tr><th class="lane">Lane<small>4 hand-offs</small></th>${[1, 2, 3, 4, 5].map(i => html`<th class="step">${String(i).padStart(2, '0')}</th>`)}</tr></thead>
        <tbody>
          ${[['Local Accounting', 'local', [0, 3]], ['Other', 'coe', [2]], ['GBS', 'gbs', [1, 3, 4]]].map(([lane, color, steps]) => html`<tr><th class="lane">${lane}<small>${steps.length} steps</small></th>${[0, 1, 2, 3, 4].map(i => steps.includes(i) ? html`<td><div class=${`stepcard${i === 3 ? ' split' : ''}`} style=${`--lane-color:var(--${color})`}><div class="tg">${['● CORE', '◆ CONTROL', '● CORE', '● CORE', '◆ CONTROL'][i]}</div>${['Collect invoices', 'Validate coding', 'Approve payment', 'Post journal', 'Reconcile'][i]}${i === 1 && lane === 'GBS' ? html`<div class="handoff">↑ from Local (To-Be: GBS)</div>` : null}</div></td>` : html`<td class="hatch"></td>`)}</tr>`)}
        </tbody></table></div>
    </${SgSection}>

    <${SgSection} title="10 · Present-mode slide" note="Full-bleed 16:9, projector-safe type, progress bar, presenter hint. Live edits allowed.">
      <div class="slide-wrap"><div class="slide"><div class="eyebrow">Record to Report · Demo Group France · 3 entities</div><h2>Period-End Close: 24 activities, 4 open deviations</h2><div class="big">62<small>% confirmed fit</small></div><div style="margin-top:3%;width:60%"><${Stack} segments=${[{ key: 'NO_GAP', value: 15, label: 'NO GAP' }, { key: 'HARMONIZATION', value: 6, label: 'HARMONIZATION' }, { key: 'STANDARDIZATION', value: 2, label: 'STANDARDIZATION' }, { key: 'BOTH', value: 1, label: 'BOTH' }]} /></div><div class="foot"><span>R2R 2 · 4 / 12</span><span>← → navigate · Esc exit</span></div><div class="progress"><i></i></div></div></div>
    </${SgSection}>

    <${SgSection} title="11 · Feedback states" note="Toast with undo after bulk actions, subtle saved indicator, skeletons during import, designed empty and error states.">
      <div class="sg-row">${toast && html`<${Toast} text="18 activities confirmed as fit" actionLabel="Undo" onAction=${() => setToast(false)} onClose=${() => setToast(false)} />`}${!toast && html`<${Button} variant="text" size="sm" onClick=${() => setToast(true)}>Show toast again</${Button}>`}<span class="saved"><span class="dot"></span>Saved 12:04</span></div>
      <div class="sg-two" style="margin-top:.6rem">
        <div class="card card-body"><div class="progress-row"><span><${Icon} name="file" /> Fit-Gap_Template_R2R.xlsx</span><span class="mono small">parsing…</span><div class="bar"><i style="width:55%"></i></div></div><div style="margin-top:.8rem;display:grid;gap:.45rem"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:85%"></div><div class="skeleton" style="width:40%"></div></div></div>
        <div><${EmptyState} title="No capture sheets yet" text="Drop the stream workbooks (R2R, A2R, I2P, I2C, ICO) here. Versions re-sent later are merged, never duplicated." action=${html`<${Button} variant="primary" icon="upload">Import capture sheets</${Button}>`} /><div class="error-box" style="margin-top:.6rem"><b>Fit-Gap_Template_ICO.xlsx could not be parsed</b>Header row not found: no "Process Level" cell in the first 30 rows. Check that the main sheet starts with "Fit-Gap".</div></div>
      </div>
    </${SgSection}>

    <${SgSection} title="12 · Accessibility" note="Visible focus rings, WCAG AA contrast in both themes, never colour alone (pills carry labels, out-of-scope is hatched, unclear is dashed). Tab through the buttons below to see the ring.">
      <div class="sg-row"><${Button} variant="primary">Focus me</${Button}><${Button} variant="outline">Then me</${Button}><input class="input" style="width:12rem" placeholder="Then this input" /><${YN} value=${null} onChange=${() => {}} name="Then the toggle" /></div>
    </${SgSection}>
  </div>`;
}
