// Reusable UI primitives (Preact + htm). Each maps to one block in the style guide.

function Button({ variant = 'outline', size, icon, kbd, children, ...rest }) {
  const cls = `btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''}`;
  return html`<button class=${cls} ...${rest}>${icon && html`<${Icon} name=${icon} />`}${children}${kbd && html`<kbd>${kbd}</kbd>`}</button>`;
}
function IconButton({ icon, label, ...rest }) {
  return html`<button class="iconbtn" title=${label} aria-label=${label} ...${rest}><${Icon} name=${icon} /></button>`;
}
function GapPill({ value, size, definitions }) {
  const v = value || 'NOT_ASSESSED';
  const label = v === 'NOT_ASSESSED' ? 'Not assessed' : (GAP_LABEL[v] || v);
  const tip = definitions && definitions[v];
  return html`<span class=${`pill pill-${v}${size ? ' ' + size : ''}`} title=${tip || label}>${label}</span>`;
}
function Tag({ kind, children }) { return html`<span class=${`tag tag-${kind}`}>${children || kind}</span>`; }
function StatusDot({ status }) { return html`<span class=${`status status-${status}`}>${WORKSHOP_STATUS_LABEL[status] || status}</span>`; }

/** Tri-state Y/N toggle: true | false | null. */
function YN({ value, onChange, size, name }) {
  return html`<span class=${`yn${size ? ' ' + size : ''}`} role="group" aria-label=${name}>
    <button type="button" aria-pressed=${value === true} onClick=${() => onChange(value === true ? null : true)}>Y</button>
    <button type="button" class="no" aria-pressed=${value === false} onClick=${() => onChange(value === false ? null : false)}>N</button>
  </span>`;
}
function Chip({ active, na, children, ...rest }) { return html`<button type="button" class=${`chip${na ? ' na' : ''}`} aria-pressed=${!!active} ...${rest}>${children}</button>`; }
function Field({ label, required, hint, error, children }) {
  return html`<div class="field"><label>${label}${required && html`<span class="req"> *</span>`}</label>${children}${error ? html`<span class="hint error">${error}</span>` : hint ? html`<span class="hint">${hint}</span>` : null}</div>`;
}
function Switch({ checked, onChange, children }) {
  return html`<label class="toggle"><input type="checkbox" checked=${checked} onChange=${e => onChange(e.target.checked)} /><i></i>${children}</label>`;
}
function Kpi({ value, unit, label, color }) {
  return html`<div class="kpi" style=${color ? `--kpi-color:${color}` : ''}><div class="value">${value}${unit && html`<small>${unit}</small>`}</div><div class="label eyebrow">${label}</div></div>`;
}
function IssueCounter({ n, label, flag }) { return html`<span class=${`issue${flag ? ' flag' : ''}`}><b>${n}</b>${label}</span>`; }

/** Stacked bar. segments: [{ key, value, label }], colour from .c-<key>. */
function Stack({ segments, size, legend = true }) {
  const total = segments.reduce((s, x) => s + (x.value || 0), 0) || 1;
  return html`<div>
    <div class=${`stack${size ? ' ' + size : ''}`} role="img" aria-label=${segments.map(s => `${s.label || s.key}: ${s.value}`).join(', ')}>
      ${segments.filter(s => s.value > 0).map(s => html`<i class=${`c-${s.key}`} style=${`width:${(100 * s.value / total).toFixed(1)}%`} title=${`${s.label || s.key}: ${s.value}`}></i>`)}
    </div>
    ${legend && html`<div class="legend">${segments.map(s => html`<span><i class=${`c-${s.key}`}></i>${s.label || s.key} <b>${s.value}</b></span>`)}</div>`}
  </div>`;
}
function MiniBar({ segments, pct }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return html`<span class="minibar"><span class="stack">${segments.filter(s => s.value > 0).map(s => html`<i class=${`c-${s.key}`} style=${`width:${(100 * s.value / total).toFixed(1)}%`}></i>`)}</span><span class="num">${pct}</span></span>`;
}
function Disclosure({ title = 'How this works', children }) {
  return html`<details class="disclosure"><summary>${title} <${Icon} name="chevron" size=${14} /></summary><div class="body">${children}</div></details>`;
}
function Card({ title, stats, open = true, onToggle, children, actions }) {
  return html`<section class="card" data-open=${open ? '1' : '0'}>
    ${title && html`<header class="card-head">${onToggle && html`<button class="iconbtn" onClick=${onToggle} aria-expanded=${open} aria-label="Toggle"><${Icon} name="chevron" /></button>`}<h3>${title}</h3>${stats && html`<div class="stats">${stats.map(([k, v]) => html`<span><b>${v}</b> ${k}</span>`)}</div>`}${actions}</header>`}
    ${open && html`<div class="card-body">${children}</div>`}
  </section>`;
}
function EmptyState({ icon = 'upload', title, text, action }) {
  return html`<div class="empty"><div class="ico"><${Icon} name=${icon} size=${22} /></div><h3>${title}</h3><p>${text}</p>${action}</div>`;
}
function Toast({ text, actionLabel, onAction, onClose }) {
  return html`<div class="toast" role="status">${text}${actionLabel && html`<button class="btn btn-text btn-sm" onClick=${onAction}>${actionLabel}</button>`}${onClose && html`<button class="iconbtn" style="color:inherit" onClick=${onClose} aria-label="Dismiss"><${Icon} name="x" size=${14} /></button>`}</div>`;
}
function PageHead({ eyebrow, title, lead, how }) {
  return html`<div class="page-head">${eyebrow && html`<div class="eyebrow">${eyebrow}</div>`}<h1>${title}</h1>${lead && html`<p class="lead">${lead}</p>`}${how && html`<${Disclosure}>${how}</${Disclosure}>`}</div>`;
}

/** Local-storage helpers wrapped in try/catch (file:// and locked-down browsers may throw). */
const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
