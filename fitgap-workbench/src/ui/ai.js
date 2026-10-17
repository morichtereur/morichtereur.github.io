// AI support: explain a process step, suggest what to check and which questions to
// ask. Calls the Claude API directly from the browser (raw HTTP – no SDK in the
// single-file build) only when the user has entered an API key; the key lives in
// this browser's local storage, never in the session file. Without a key the
// prompt can be copied into any chat tool.

const AI_MODELS = [['claude-opus-5-5', 'Claude Opus 5.5 (default)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5']];
const AI_SYSTEM = `You support a finance-transformation consultant who runs a GBS (global business services) fit-gap workshop with local accountants of several legal entities. A process taxonomy (L1–L4) describes the global standard ("To-Be"); GBS Operations pre-assessed the as-is per entity. In the workshop every activity is assessed: who performs it today (local accounting, GBS, other party), whether there is a gap vs. the global standard, and details.
Gap types: NO GAP = entity already follows the standard; HARMONIZATION GAP = the split between country and GBS deviates (who does it); STANDARDIZATION GAP = the way it is executed deviates (how – steps, systems, tools); BOTH GAPS = both.
Resolution approaches for deviations: Separate variant (legal/tax/regulatory reasons), Close before go-live, Lift & shift.
Answer in English, concise and practical, in short bullet points. Do not invent facts about the client; when something depends on the client, say what to ask.`;

function aiSettings() { return store.get('fg.ai', { apiKey: '', model: 'claude-opus-5-5', effort: 'medium' }); }
function saveAiSettings(v) { store.set('fg.ai', v); }

function stepContext(session, a) {
  const p = session.processes[a.processId]; if (!p) return '';
  const path = []; let cur = session.processes[p.parentId]; while (cur) { path.unshift(`${cur.id} ${cur.name}`); cur = session.processes[cur.parentId]; }
  const yn = (v) => v === true ? 'yes' : v === false ? 'no' : 'not set';
  const dg = DETAILED_GAP_FIELDS.filter(f => a.detailedGap[f]).map(f => `${DETAILED_GAP_LABEL[f]}: ${a.detailedGap[f]}`).join('; ');
  return [`Client: ${session.settings.clientName || 'n/a'} · Country: ${session.settings.country || 'n/a'} · Entity: ${session.entities[a.entityCode]?.displayName || a.entityCode}`,
    `Process path: ${path.join(' › ')}`, `Activity: ${p.id} ${p.name}${p.description ? ' – ' + p.description : ''}`,
    `To-Be (global standard): local entity ${yn(p.toBe?.le)}, GBS ${yn(p.toBe?.gbs)}${p.toBe?.system ? ', system ' + p.toBe.system : ''}${p.toBe?.initiative ? ', planned initiative ' + p.toBe.initiative : ''}`,
    `Ops pre-assessment (as-is): local ${yn(a.asIs.le)}, GBS ${yn(a.asIs.gbs)}${a.asIs.systems ? ', systems ' + a.asIs.systems : ''}, GAP ${GAP_LABEL[a.asIs.gap] || 'not assessed'}${a.asIs.info ? ', note: ' + a.asIs.info : ''}`,
    `Workshop so far: local ${yn(a.fitGap.local)}, GBS ${yn(a.fitGap.gbs)}, other ${yn(a.fitGap.other)}, gap type ${a.workshop.gapType ? GAP_LABEL[a.workshop.gapType] : 'not set'}${a.workshop.rationale ? ', rationale: ' + a.workshop.rationale : ''}${dg ? '; details: ' + dg : ''}`,
    ...(p.context ? Object.entries(p.context).map(([k, v]) => `${k}: ${Object.entries(v).map(([h, x]) => `${h}=${x}`).join(', ')}`) : [])].join('\n');
}
const EXPLAIN_PROMPT = `Explain this process step for the workshop:
1. What this activity typically means in practice (2–3 sentences).
2. Typical reasons why a local entity deviates from the global standard – by dimension: business, IT systems, legal/regulatory.
3. 3–5 concrete questions to ask the local accountants to decide fit or gap.
4. If there is a gap: would it rather be a harmonization or a standardization gap, and which resolution approach is typical?
Keep it under 220 words.`;

async function callClaude({ apiKey, model, effort }, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    body: JSON.stringify({ model, max_tokens: 2000, system: AI_SYSTEM, output_config: { effort: effort || 'medium' }, fallbacks: 'default', messages }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  if (data.stop_reason === 'refusal') throw new Error(`The model declined this request${data.stop_details?.explanation ? ': ' + data.stop_details.explanation : ''}.`);
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

function renderAnswer(text) {
  return text.split(/\n/).map((line, i) => { const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/); const h = line.match(/^\s*#+\s*(.*)$|^\s*\*\*(.+?)\*\*\s*:?\s*$/); if (h) return html`<div class="ai-h" key=${i}>${h[1] || h[2]}</div>`; if (m) return html`<div class="ai-li" key=${i}>• ${m[1].replace(/\*\*/g, '')}</div>`; if (!line.trim()) return html`<div style="height:.3rem" key=${i}></div>`; return html`<p key=${i} style="margin:0 0 .2rem">${line.replace(/\*\*/g, '')}</p>`; });
}

function AiPanel({ session, akey, updateSession, toast, onClose }) {
  const a = akey ? session.assessments[akey] : null; const p = a ? session.processes[a.processId] : null;
  const [cfg, setCfg] = useState(aiSettings); const [showCfg, setShowCfg] = useState(!aiSettings().apiKey);
  const [thread, setThread] = useState([]); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { setThread([]); setErr(''); }, [akey]);
  const ctx = a ? stepContext(session, a) : `Client: ${session.settings.clientName || 'n/a'} · Country: ${session.settings.country || 'n/a'} · streams: ${[...new Set(Object.values(session.processes).map(x => x.stream))].join(', ')}`;
  const ask = async (text) => {
    const msgs = [...thread, { role: 'user', content: thread.length ? text : `${ctx}\n\n${text}` }];
    setThread(msgs); setErr('');
    if (!cfg.apiKey) { setErr('No API key – enter one in the settings below, or copy the prompt into your chat tool.'); return; }
    setBusy(true);
    try { const answer = await callClaude(cfg, msgs); setThread([...msgs, { role: 'assistant', content: answer }]); }
    catch (e) { setErr(e.message); setThread(thread); }
    finally { setBusy(false); }
  };
  const copyPrompt = () => { navigator.clipboard?.writeText(`${AI_SYSTEM}\n\n${ctx}\n\n${EXPLAIN_PROMPT}`).then(() => toast('Prompt copied – paste it into your chat tool')); };
  const save = (patch) => { const v = { ...cfg, ...patch }; setCfg(v); saveAiSettings(v); };
  return html`<div class="popover card ai-panel"><div class="card-head"><h3><${Icon} name="spark" /> AI support</h3><${IconButton} icon="x" label="Close" onClick=${onClose} /></div><div class="card-body">
    ${a ? html`<div class="eyebrow">Process step</div><div><span class="mono small muted">${p.id}</span> <b>${p.name}</b> <span class="muted small">· ${session.entities[a.entityCode]?.displayName || a.entityCode}</span></div>` : html`<p class="small muted">Open an activity in the workshop to get step-specific help, or ask a general question.</p>`}
    <div class="sg-row" style="margin:.6rem 0">${a && html`<${Button} variant="primary" size="sm" icon="spark" disabled=${busy} onClick=${() => ask(EXPLAIN_PROMPT)}>Explain this step</${Button}>`}<${Button} variant="outline" size="sm" icon="copy" onClick=${copyPrompt} title="For laptops without API access: copy the prompt and paste it into your chat tool">Copy prompt</${Button}><${Button} variant="text" size="sm" onClick=${() => setShowCfg(!showCfg)}>Settings</${Button}></div>
    ${showCfg && html`<div class="ai-cfg"><${Field} label="Claude API key" hint="Stored only in this browser, never in the session file. Each request sends the step context to api.anthropic.com."><input class="input sm" type="password" value=${cfg.apiKey} onInput=${e => save({ apiKey: e.target.value.trim() })} placeholder="sk-ant-…" /></${Field}><div class="fgrid"><${Field} label="Model"><select class="select sm" value=${cfg.model} onChange=${e => save({ model: e.target.value })}>${AI_MODELS.map(([id, l]) => html`<option value=${id}>${l}</option>`)}</select></${Field}><${Field} label="Effort"><select class="select sm" value=${cfg.effort} onChange=${e => save({ effort: e.target.value })}>${['low', 'medium', 'high'].map(x => html`<option value=${x}>${x}</option>`)}</select></${Field}></div></div>`}
    <div class="ai-thread">${thread.map((m, i) => html`<div class=${`ai-msg ai-${m.role}`} key=${i}>${m.role === 'user' ? html`<div class="small muted">${i === 0 ? (m.content.endsWith(EXPLAIN_PROMPT) ? 'Explain this step' : m.content.split('\n\n').pop()) : m.content}</div>` : html`<div>${renderAnswer(m.content)}</div><div class="sg-row" style="margin:.3rem 0 0">${a && html`<${Button} variant="text" size="sm" onClick=${() => { updateSession(s => applyChange(s, a.key, 'workshop.comment', ((s.assessments[a.key].workshop.comment || '') + '\n[AI] ' + m.content).trim())); toast('Added to the comment'); }}>Add to comment</${Button}>`}<${Button} variant="text" size="sm" onClick=${() => navigator.clipboard?.writeText(m.content)}>Copy</${Button}></div>`}</div>`)}${busy && html`<div class="skeleton" style="width:70%"></div>`}${err && html`<div class="error-box" style="margin-top:.4rem">${err}</div>`}</div>
    <div class="sg-row" style="margin-top:.6rem"><input class="input sm" style="flex:1" value=${q} placeholder=${a ? 'Ask about this step…' : 'Ask a question…'} onInput=${e => setQ(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && q.trim()) { ask(q.trim()); setQ(''); } }} /><${Button} variant="outline" size="sm" disabled=${busy || !q.trim()} onClick=${() => { ask(q.trim()); setQ(''); }}>Ask</${Button}></div>
  </div></div>`;
}
