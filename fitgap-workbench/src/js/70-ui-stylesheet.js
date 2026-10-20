/* ---------------------------------------------------------------------------
 * 70-ui-stylesheet.js – one-page style sheet: tokens + components, for sign-off
 * before the workshop screens are built.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG, UI = FG.ui, el = UI.el;
  const TOKENS = ['--bg', '--panel', '--line', '--line-strong', '--ink', '--ink-2', '--accent', '--accent-2', '--accent-soft', '--gbs', '--local', '--split', '--coe', '--auto', '--none', '--flag', '--side', '--side-2', '--side-accent'];
  const GAPS = ['--gap-none', '--gap-harm', '--gap-stand', '--gap-both', '--gap-na', '--gap-oos', '--gap-unclear', '--gap-empty'];
  function swatches(list) { const cs = getComputedStyle(document.documentElement); return el('div.swatches', list.map(t => el('div.swatch', el('i', { style: { background: 'var(' + t + ')' } }), el('span', t.replace('--', ''), el('br'), el('span.muted', cs.getPropertyValue(t).trim()))))); }
  UI.VIEWS.stylesheet = { crumb: () => ['Style sheet'], render(c) {
    const page = el('div.page');
    page.appendChild(UI.pageHead('Style sheet', 'Splitfold consulting edition – tokens and components as used across the workbench. Toggle the theme in the top bar to check both modes.'));
    page.appendChild(el('div.card', el('div.card-head', el('h2', 'Colour tokens')), swatches(TOKENS), el('div.eyebrow', { style: { margin: '1rem 0 .5rem' } }, 'Gap types · colour-blind safe, always with a label'), swatches(GAPS)));
    page.appendChild(el('div.card', el('div.card-head', el('h2', 'Typography')),
      el('div.serif', { style: { fontSize: 'var(--fs-2xl)', lineHeight: 1.1 } }, 'Which end-to-end process are you working on?'), el('p.muted.small', 'Source Serif 4 · page titles and big headings'),
      el('div', { style: { fontSize: 'var(--fs-md)' } }, 'Instrument Sans for everything in the UI – labels, tables, buttons, body copy.'), el('p.muted.small', 'Instrument Sans · UI'),
      el('div.mono', 'R2R 2.1.1 · 1,293 assessments · 62% · FTE 0.4'), el('p.muted.small', 'IBM Plex Mono · process IDs and numbers'),
      el('div.eyebrow', 'Process flow · Master data maintenance'), el('p.muted.small', 'Eyebrow · small uppercase letter-spaced section label')));
    page.appendChild(el('div.card', el('div.card-head', el('h2', 'Buttons and links')),
      el('div.demo-row', el('button.btn.primary', 'Primary – one per screen'), el('button.btn', 'Outlined'), el('button.btn.sm', 'Small'), el('button.btn.danger', 'Danger'), el('button.btn', { disabled: true }, 'Disabled'), el('button.link', 'Underlined text link'), el('button.iconbtn', { title: 'icon button' }, UI.icon('search'))),
      el('div.demo-row', el('button.btn.sm', { onClick: () => UI.toast('Confirmed 18 activities as fit', { action: 'Undo', onAction: () => UI.toast('Undone') }) }, 'Show toast with undo'), el('button.btn.sm', { onClick: () => UI.confirmDialog('Leave this L3?', '3 activities still have missing Detailed Gap fields.', 'Leave anyway') }, 'Show dialog'))));
    page.appendChild(el('div.card', el('div.card-head', el('h2', 'Pills and tags')),
      el('div.demo-row', ['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH', 'NA', 'OUT_OF_SCOPE', 'UNCLEAR', 'EMPTY'].map(k => UI.gapPill(k))),
      el('div.demo-row', el('span.pill.gbs', 'GBS'), el('span.pill.local', 'LOCAL'), el('span.pill.mixed', 'MIXED'), el('span.pill.neutral', 'NEUTRAL'), el('span.pill.ok', 'Confirmed fit'), el('span.pill.warn', 'Open question'), el('span.pill.flag', 'Changed vs. Ops'), el('span.pill.info', 'v2'))));
    page.appendChild(el('div.card', el('div.card-head', el('h2', 'Inputs, toggles, chips')),
      el('div.form-grid', el('div.field', el('label', 'Text input'), el('input.input', { placeholder: 'Rationale…' })), el('div.field', el('label', 'Select'), el('select.select', el('option', 'Separate variant'), el('option', 'Close before go-live'), el('option', 'Lift & shift'))), el('div.field', el('label', 'Number'), el('input.input', { type: 'number', value: '0.4', step: '0.1' }))),
      el('div.field', el('label', 'Textarea'), el('textarea.textarea', { placeholder: 'Comment…' })),
      el('div.demo-row', el('span.small', 'Y/N toggle'), el('div.toggle', el('button.on', 'Y'), el('button', 'N'), el('button', '–')), el('span.small', 'Switch'), el('button.switch.on', { role: 'switch', onClick: (e) => e.currentTarget.classList.toggle('on') }), el('span.small', 'Tri-state'), el('div.toggle', el('button', 'Y'), el('button.on.n', 'N'), el('button', 'n/a'))),
      el('div.chips', el('span.chip.on', 'SAP'), el('span.chip', 'SNOW'), el('span.chip', 'Blackline'), el('span.chip', 'Coupa'), el('span.chip', '+ free text'))));
    const mix = { NO_GAP: 62, HARMONIZATION: 21, STANDARDIZATION: 9, BOTH: 5, NA: 3 };
    page.appendChild(el('div.card', el('div.card-head', el('h2', 'KPIs, bars, table rows')),
      el('div.kpis', el('div.kpi', el('div.v', '168', el('small', '79%')), el('div.l', 'GBS')), el('div.kpi.ok', el('div.v', '62%'), el('div.l', 'Confirmed fit')), el('div.kpi.issue', el('div.v', '3'), el('div.l', 'Ops and workshop disagree')), el('div.kpi.none', el('div.v', '406'), el('div.l', 'Out of scope'))),
      UI.stackBar(mix, { lg: true }), UI.legend(mix),
      el('table.table.compact', { style: { marginTop: '.8rem' } }, el('thead', el('tr', el('th', 'Process ID'), el('th', 'Activity'), el('th', 'To-Be'), el('th', '300101'), el('th', '300102'), el('th', 'Split'), el('th.num', 'FTE'))),
        el('tbody', el('tr.clickable', el('td.pid', 'R2R 1.1.1.1'), el('td', 'Manual journal entry processing'), el('td', el('span.pill.gbs', 'GBS')), el('td', UI.gapPill('NO_GAP', { short: true })), el('td', UI.gapPill('HARMONIZATION', { short: true })), el('td', el('span.mini', UI.stackBar({ NO_GAP: 1, HARMONIZATION: 1 }), '50%')), el('td.num', '0.4')),
          el('tr.clickable.selected', el('td.pid', 'R2R 1.1.1.2'), el('td', 'Recurring journals'), el('td', el('span.pill.local', 'LOCAL')), el('td', UI.gapPill('STANDARDIZATION', { short: true })), el('td', UI.gapPill('OUT_OF_SCOPE', { short: true })), el('td', el('span.mini', UI.stackBar({ STANDARDIZATION: 1 }), '100%')), el('td.num', '–'))))));
    page.appendChild(el('div.card', el('div.card-head', el('h2', 'Card and block')),
      el('details.card.block', { open: true }, el('summary', el('span.car', '▶'), el('h3', 'R2R 1 · General Ledger'), el('span.mini', '48 activities', UI.stackBar(mix))), el('div.block-body.small.muted', 'Collapsible block per L2 with header stats; rows per L3/L4 inside.'))));
    page.appendChild(el('div.card', el('div.card-head', el('h2', 'Slide (present mode)')),
      el('div.slide', el('div.eyebrow', 'R2R · stream summary'), el('div.num', '62%'), el('div.big', 'confirmed fit across 3 entities'), el('div.foot', el('span', 'Demo Group · France · CW43'), el('span', '← → navigate · Esc exit')), el('div.prog', el('span', { style: { width: '40%' } })))));
    page.appendChild(el('div.card', el('div.card-head', el('h2', 'Loading, empty')), el('div', { style: { display: 'grid', gap: '.4rem', maxWidth: '20rem' } }, el('div.skeleton'), el('div.skeleton', { style: { width: '70%' } }), el('div.skeleton', { style: { width: '85%' } })), el('div.empty', { style: { padding: '1.5rem' } }, UI.icon('inbox', 'ico'), el('h2', 'Nothing here yet'), el('p', 'Designed empty state with one action.'))));
    c.appendChild(page);
  } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
