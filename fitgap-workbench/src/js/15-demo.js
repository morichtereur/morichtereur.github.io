/* ---------------------------------------------------------------------------
 * 15-demo.js – demo data generator. Builds capture-sheet workbooks for a
 * fictional client ("Demo Group") with the SAME structural quirks as the real
 * pilot files, so the parser can be tested and the tool demoed without client
 * data. Used by scripts/make-demo-workbooks.mjs and by the "Load demo data"
 * action in the app. Deterministic (seeded).
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG || (root.FG = {});

  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  /** Deterministic per-cell random in [0,1): same Process ID × entity × field → same value in every file. */
  function cellRand(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }

  const ENTITIES = [
    { code: '300101', name: 'Demo France SAS' },
    { code: '300102', name: 'Demo Pharma France SAS' },
    { code: '300103', name: 'Demo Services SARL' },
  ];

  const TAXONOMY = {
    R2R: { name: 'Record to Report', l1: [
      ['General Ledger', [['Journal Entries', ['Manual journal entry processing', 'Recurring journals', 'Accrual postings']], ['Period-end close', ['Close calendar management', 'Cut-off checks', 'Subledger-to-GL reconciliation']]]],
      ['Master Data', [['GL Master Data Maintenance', ['Account master creation', 'Cost centre maintenance', 'Profit centre maintenance']]]],
      ['Fixed Assets Reporting', [['Asset reporting', ['Depreciation run review', 'Asset roll-forward']]]],
      ['Tax & Statutory', [['Statutory reporting', ['Local GAAP adjustments', 'Statutory accounts preparation', 'Tax package']]]],
    ] },
    A2R: { name: 'Acquire to Retire', l1: [
      ['Fixed Asset Accounting', [['Asset master data', ['Asset class setup', 'Asset master creation', 'Asset master change']], ['Capitalisation', ['AuC settlement', 'Capitalisation posting', 'Asset transfer']], ['Depreciation', ['Depreciation run', 'Depreciation adjustment']], ['Retirement', ['Asset scrapping', 'Asset sale']]]],
      ['Inventory Accounting', [['Inventory valuation', ['Standard cost update', 'Inventory revaluation', 'Lower-of-cost test']], ['Physical inventory', ['Count preparation', 'Count execution', 'Count difference posting']]]],
    ] },
    I2P: { name: 'Invoice to Pay', l1: [
      ['Vendor Master Data', [['Vendor master maintenance', ['Vendor creation', 'Vendor change', 'Vendor block', 'Bank data validation']]]],
      ['Invoice Processing', [['Invoice receipt', ['Scanning', 'OCR validation', 'Invoice registration']], ['Invoice verification', ['3-way match', '2-way match', 'Exception handling', 'Approval workflow']], ['Posting', ['PO invoice posting', 'Non-PO invoice posting', 'Credit note posting']]]],
      ['Payments', [['Payment run', ['Payment proposal', 'Payment approval', 'Payment execution', 'Payment file transmission']], ['Payment exceptions', ['Rejected payments', 'Urgent payments']]]],
      ['Travel and Expense', [['Expense claims', ['Claim submission', 'Claim audit', 'Claim reimbursement']]]],
    ] },
    I2C: { name: 'Invoice to Cash', l1: [
      ['Customer Master Data Management', [['Customer master maintenance', ['Customer creation', 'Customer change', 'Customer block', 'Credit limit setup']]]],
      ['Billing', [['Invoice creation', ['Billing run', 'Manual invoice', 'Credit memo']]]],
      ['Collections', [['Dunning', ['Dunning run', 'Dunning review', 'Dispute logging']]]],
      ['Cash Application', [['Incoming payments', ['Bank statement import', 'Automatic clearing', 'Manual clearing']]]],
    ] },
    ICO: { name: 'Intercompany', l1: [
      ['Intercompany Billing', [['IC invoicing', ['IC invoice creation', 'IC invoice approval', 'IC invoice posting']]]],
      ['Intercompany Reconciliation', [['IC balance reconciliation', ['Balance confirmation', 'Difference analysis', 'Difference resolution']]]],
      ['Intercompany Settlement', [['IC netting', ['Netting proposal', 'Netting approval', 'Netting settlement']]]],
    ] },
  };
  const VERBS = ['Prepare', 'Review', 'Post', 'Approve', 'Validate', 'Reconcile', 'Archive', 'Monitor', 'Correct', 'Report', 'Upload', 'Check'];
  const OBJECTS = ['supporting documents', 'exceptions', 'entries', 'batch', 'control report', 'master record', 'request', 'balance', 'adjustment', 'file'];
  const SYSTEMS = ['SAP', 'SAP / SNOW', 'SNOW', 'Blackline', 'Coupa', 'Excel', 'Concur'];

  /** Number of L4 activities per file, scaled so files resemble the pilot sizes. */
  const TARGET = { R2R: 120, A2R: 250, I2P: 430, I2C: 300, ICO: 340 };

  function buildTaxonomy(stream, rand) {
    const t = TAXONOMY[stream];
    const rows = [{ level: 0, id: stream, name: t.name, description: '' }];
    const l3s = [];
    let i1 = 0;
    for (const [l1name, l2s] of t.l1) {
      i1++; const id1 = `${stream} ${i1}`;
      rows.push({ level: 1, id: id1, name: l1name, description: '', l1: l1name });
      let i2 = 0;
      for (const [l2name, l3list] of l2s) {
        i2++; const id2 = `${id1}.${i2}`;
        rows.push({ level: 2, id: id2, name: l2name, description: '', l1: l1name });
        let i3 = 0;
        for (const l3name of l3list) {
          i3++; const id3 = `${id2}.${i3}`;
          rows.push({ level: 3, id: id3, name: l3name, description: '', l1: l1name });
          l3s.push({ id: id3, name: l3name, l1: l1name, idx: rows.length });
        }
      }
    }
    // distribute activities over L3s
    const per = Math.max(2, Math.round(TARGET[stream] / l3s.length));
    const out = [];
    for (const r of rows) {
      out.push(r);
      const l3 = l3s.find(x => x.id === r.id);
      if (!l3) continue;
      const n = stream === 'I2C' && r.id === 'I2C 1.1.1' ? 49 : per + Math.floor(rand() * 3) - 1;
      for (let k = 1; k <= n; k++) {
        const v = VERBS[Math.floor(rand() * VERBS.length)], o = OBJECTS[Math.floor(rand() * OBJECTS.length)];
        out.push({ level: 4, id: `${r.id}.${k}`, name: `${v} ${o}`, description: `${v} the ${o} for ${l3.name.toLowerCase()} (${stream}).`, l1: r.l1 });
      }
    }
    return out;
  }

  /** Column layout builder. Returns { cols:[{block, entity, group, field}], titleRows } */
  function layout(stream, entityOrder) {
    const cols = [];
    const push = (block, field, entity, group) => cols.push({ block, field, entity: entity || null, group: group || null });
    push('toBe', 'LE', null, 'Activity Split To-be'); push('toBe', 'GBS', null, 'Activity Split To-be'); push('toBe', 'System'); push('toBe', 'Planned initiative');
    for (const e of entityOrder) {
      push('asIs', 'LE/Country/Other', e, 'Activity Split As-is'); push('asIs', 'GBS', e, 'Activity Split As-is'); push('asIs', 'Used Systems', e); push('asIs', 'GAP', e); push('asIs', 'Additional Information', e);
      push('fitGap', 'Local Accounting (Y/N)', e); push('fitGap', 'Other', e); push('fitGap', 'GBS (Y/N)', e); push('fitGap', 'FTE', e);
      for (const f of ['IT Systems', 'Workflow Tools', 'Current Process (country specifics)', 'External Party', 'Language requirements', 'Legal/Regulatory', 'Internal Controls']) push('detailedGap', f, e);
    }
    push('processSpec', 'Process owner'); push('processSpec', 'Frequency');
    push('automation', 'Automation potential'); push('automation', 'Tool');
    push('changeImpact', 'Impact');
    push('raci', 'R'); push('raci', 'A'); push('raci', 'C'); push('raci', 'I');
    return cols;
  }

  const TITLES = { toBe: 'TO BE PROCESS SPECIFIC INFORMATION', asIs: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGap: 'FIT-GAP ASSESSMENT', detailedGap: 'DETAILED GAP ASSESSMENT', processSpec: 'PROCESS (SPECIFIC) INFORMATION (IF NEEDED)', automation: 'AUTOMATION ANALYSIS', changeImpact: 'CHANGE IMPACT ANALYSIS', raci: 'RACI Matrix' };

  /**
   * Build one capture sheet. opts:
   *  headerRow (1-based), noAsIsTitle, fitGapTypo, mergeTitles, mergeEntities,
   *  entitySuffix, oosShare, instructionCells, strayRows, gapTypos, unmappedGap
   */
  function buildSheet(XLSX, stream, rows, entityOrder, opts) {
    const cols = layout(stream, entityOrder);
    const hr = opts.headerRow - 1; // 0-based
    const base = 1; // column B
    const aoa = [];
    const set = (r, c, v) => { while (aoa.length <= r) aoa.push([]); aoa[r][c] = v; };
    const merges = [];
    set(0, 1, `${TAXONOMY[stream].name} – Fit-Gap capture sheet (Demo Group)`);
    set(1, 1, 'Version 1.0 – prepared by GBS Operations');
    // header row
    set(hr, base, 'Process Level'); set(hr, base + 1, 'Process ID'); set(hr, base + 2, 'Process'); set(hr, base + 3, 'Activity description');
    const c0 = base + 4;
    // block titles (row hr-2), entity labels (row hr-3), groups (row hr-1), field names (row hr)
    let i = 0;
    while (i < cols.length) {
      const b = cols[i].block, e = cols[i].entity;
      let j = i; while (j < cols.length && cols[j].block === b && cols[j].entity === e) j++;
      const title = TITLES[b] === 'FIT-GAP ASSESSMENT' && opts.fitGapTypo ? 'FIT-GAP ASSSSMENT' : TITLES[b];
      if (!(b === 'asIs' && opts.noAsIsTitle)) {
        set(hr - 2, c0 + i, title);
        if (opts.mergeTitles && j - i > 1) merges.push({ s: { r: hr - 2, c: c0 + i }, e: { r: hr - 2, c: c0 + j - 1 } });
      }
      i = j;
    }
    // entity labels over the three per-entity blocks
    i = 0;
    while (i < cols.length) {
      const e = cols[i].entity;
      if (!e) { i++; continue; }
      let j = i; while (j < cols.length && cols[j].entity === e) j++;
      const label = `${e.code} ${e.name}${opts.entitySuffix ? ' ' + opts.entitySuffix : ''}`;
      set(hr - 3, c0 + i, label);
      if (opts.mergeEntities) merges.push({ s: { r: hr - 3, c: c0 + i }, e: { r: hr - 3, c: c0 + j - 1 } });
      i = j;
    }
    // groups (merged over 2 cols) and field names
    i = 0;
    while (i < cols.length) {
      const g = cols[i].group;
      if (!g) { i++; continue; }
      let j = i; while (j < cols.length && cols[j].group === g && cols[j].entity === cols[i].entity) j++;
      set(hr - 1, c0 + i, g);
      merges.push({ s: { r: hr - 1, c: c0 + i }, e: { r: hr - 1, c: c0 + j - 1 } });
      i = j;
    }
    cols.forEach((c, k) => set(hr, c0 + k, c.field));

    // data rows
    let r = hr + 1;
    const gapPool = ['NO GAP', 'NO GAP', 'NO GAP', 'NO GAP', 'No Gap', 'HARMONIZATION', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH GAPs', 'n/a'];
    if (opts.gapTypos) gapPool.push('HARMINIZATION', '?', 'Harmonisation Gap');
    if (opts.unmappedGap) gapPool.push('Gap tbd by Ops');
    let strayDone = 0, instrDone = 0;
    for (const row of rows) {
      if (opts.strayRows && row.level === 2 && strayDone < 2) {
        set(r, base, 'Process Level'); set(r, base + 1, 'Process ID'); set(r, base + 2, 'Intercompany sub-process'); r++; strayDone++;
      }
      set(r, base, row.level); set(r, base + 1, row.id); set(r, base + 2, row.name); set(r, base + 3, row.description || null);
      if (row.level >= 4) {
        const toBeGbs = cellRand(row.id + '|tobe') < 0.7;
        cols.forEach((c, k) => {
          const col = c0 + k;
          const rand = () => cellRand(row.id + '|' + (c.entity ? c.entity.code : '') + '|' + c.block + '|' + c.field);
          let v = null;
          if (c.block === 'toBe') {
            if (c.field === 'LE') v = toBeGbs ? 'N' : 'Y'; else if (c.field === 'GBS') v = toBeGbs ? 'Y' : 'N';
            else if (c.field === 'System') v = SYSTEMS[Math.floor(rand() * SYSTEMS.length)];
            else if (c.field === 'Planned initiative') v = rand() < 0.15 ? `INI-${100 + Math.floor(rand() * 120)} ${['E-invoicing', 'Workflow harmonisation', 'RPA bank statements', 'Vendor portal'][Math.floor(rand() * 4)]}` : null;
          } else if (c.block === 'asIs') {
            const oos = opts.oosShare && rand() < opts.oosShare && row.level === 4 && c.entity;
            if (c.field === 'LE/Country/Other') v = rand() < 0.6 ? 'Y' : 'N';
            else if (c.field === 'GBS') v = rand() < 0.5 ? 'Y' : 'N';
            else if (c.field === 'Used Systems') v = SYSTEMS[Math.floor(rand() * SYSTEMS.length)];
            else if (c.field === 'GAP') v = rand() < 0.08 ? null : gapPool[Math.floor(rand() * gapPool.length)];
            else if (c.field === 'Additional Information') v = rand() < 0.2 ? 'Local specifics apply – see comment' : null;
            if (oos && c.field === 'GAP') v = 'Out of scope';
          } else if (c.block === 'fitGap' || c.block === 'detailedGap') {
            // mostly empty – pre-set values are Out of scope markers and instruction text
            if (opts.oosShare && c.field === 'Local Accounting (Y/N)') {
              const entIdx = entityOrder.indexOf(c.entity);
              if ((row.id.charCodeAt(row.id.length - 1) + entIdx) % Math.round(1 / opts.oosShare) === 0) v = 'Out of scope';
            }
            if (opts.instructionCells && instrDone < opts.instructionCells && c.field === 'Current Process (country specifics)' && rand() < 0.02) { v = 'to be copied into Vial and discussed with local team'; instrDone++; }
          } else if (c.block === 'processSpec') {
            v = c.field === 'Frequency' ? ['daily', 'weekly', 'monthly'][Math.floor(rand() * 3)] : (rand() < 0.3 ? 'Process owner FR' : null);
          } else if (c.block === 'automation') {
            v = c.field === 'Tool' ? (rand() < 0.2 ? 'RPA' : null) : ['low', 'medium', 'high'][Math.floor(rand() * 3)];
          } else if (c.block === 'changeImpact') v = rand() < 0.3 ? 'medium' : null;
          else if (c.block === 'raci') v = rand() < 0.5 ? 'GBS' : 'LE';
          if (v !== null) set(r, col, v);
        });
      }
      r++;
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    return ws;
  }

  function flowSheet(XLSX, stream, rows) {
    const aoa = [['Process flows ' + stream], []];
    for (const r of rows.filter(x => x.level === 3)) { aoa.push([null, r.id, r.name]); for (let k = 0; k < 12; k++) aoa.push([]); }
    return XLSX.utils.aoa_to_sheet(aoa);
  }

  /** Returns [{ name, wb }] for the six demo files. */
  function buildWorkbooks(XLSX) {
    const rand = rng(43);
    const [A, B, C] = ENTITIES;
    const files = [];
    const mk = (fileName, stream, sheetName, entityOrder, opts, extra) => {
      const rows = buildTaxonomy(stream, rng(stream.charCodeAt(0) * 131 + stream.charCodeAt(2) * 7 + 43));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Demo Group – Fit-Gap capture sheet'], ['Stream', stream]]), 'Cover');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['>>']]), '>>');
      if (extra && extra.oldSheet) XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, stream, rows.slice(0, 20), entityOrder, { ...opts, headerRow: 6 }), extra.oldSheet);
      XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, stream, extra && extra.rowsFilter ? rows.filter(extra.rowsFilter) : rows, entityOrder, opts), sheetName);
      XLSX.utils.book_append_sheet(wb, flowSheet(XLSX, stream, rows), 'Process Flows_' + stream);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Process capture notes']]), 'PROCESS CAPTURE');
      files.push({ name: fileName, wb, stream });
      return rows;
    };
    mk('Demo_FitGap_R2R.xlsx', 'R2R', 'Fit-Gap Template_R2R', [A, B, C], { headerRow: 6, noAsIsTitle: true, mergeTitles: true, mergeEntities: true, gapTypos: true });
    mk('Demo_FitGap_A2R.xlsx', 'A2R', 'Fit-Gap Template_A2R', [B, C, A], { headerRow: 8, fitGapTypo: true, mergeTitles: true, mergeEntities: true, oosShare: 0.4 }, { oldSheet: 'Fit-Gap Template_A2R_vold' });
    mk('Demo_FitGap_I2P.xlsx', 'I2P', 'Fit-Gap Template_I2P', [C, A, B], { headerRow: 9, mergeTitles: true, mergeEntities: true, oosShare: 0.3, instructionCells: 3, unmappedGap: true }, { oldSheet: 'Fit-Gap Template_I2P_v2' });
    const i2cRows = mk('Demo_FitGap_I2C.xlsx', 'I2C', 'Fit-gap Template_I2C', [A, B, C], { headerRow: 8, mergeTitles: true, mergeEntities: true, entitySuffix: '(Legal entity)', gapTypos: true });
    mk('Demo_FitGap_ICO.xlsx', 'ICO', 'Fit-Gap Template_ICO ', [A, C, B], { headerRow: 8, mergeTitles: false, mergeEntities: false, strayRows: true });
    // I2C_CMD = subset of I2C: everything under I2C 1.1 (customer master data)
    const cmd = files.find(f => f.stream === 'I2C');
    const rows = i2cRows.filter(r => r.id === 'I2C' || r.id === 'I2C 1' || r.id.startsWith('I2C 1.1'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Customer master data – MD session']]), 'Cover');
    XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, 'I2C', rows, [B, A, C], { headerRow: 8, mergeTitles: true, mergeEntities: true, gapTypos: true }), 'Fit-Gap Template_I2C_CMD');
    files.push({ name: 'Demo_FitGap_I2C_CMD.xlsx', wb, stream: 'I2C' });
    void cmd;
    return files;
  }

  FG.demo = { buildWorkbooks, ENTITIES, TAXONOMY };
})(typeof globalThis !== 'undefined' ? globalThis : window);
