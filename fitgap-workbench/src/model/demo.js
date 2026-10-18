// Demo data: fictional "Demo Group" capture workbooks with the same structure as
// the real capture sheets (header row 6/8/9, title spelling variants, entity order,
// Out-of-scope rows, GAP typos, instruction text, old sheet copy, flow sheets with an
// image). Shared by scripts/generate-demo.mjs (Node) and the in-app "Try with demo data".
const DEMO_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAIAAACwpMoFAAAA9klEQVR4nO3RsQmAMAAAwWziRu7jxjYp3CClja0EnoMb4OHHcV6Eje0F/MrguHfwPR8yDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7guI/BJBkcZ3DcArk3UQDSQyGRAAAAAElFTkSuQmCC';

const ENTITIES = [
  { code: '301001', name: 'Demo France SAS' },
  { code: '301002', name: 'Demo Pharma France SAS' },
  { code: '301003', name: 'Demo Logistics SARL' },
];

// Deterministic pseudo-random so the fixture is stable across runs.
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
// Values keyed by activity × entity so overlapping files (I2C vs. I2C_CMD) carry identical data.
const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const seedFor = (key) => { seed = hash(key) & 0x7fffffff; };

const TAXONOMY = {
  R2R: [
    ['General Ledger Accounting', [['Journal Entries', 6], ['Account Reconciliations', 5], ['Period-End Close', 7]]],
    ['Fixed Period Reporting', [['Statutory Reporting', 4], ['Management Reporting', 5]]],
    ['Master Data Financial', [['Chart of Accounts Maintenance', 4], ['Cost Centre Master Data', 3]]],
  ],
  A2R: [
    ['Fixed Asset Accounting', [['Asset Acquisition', 6], ['Depreciation Run', 4], ['Asset Retirement', 5]]],
    ['Inventory Accounting', [['Inventory Valuation', 6], ['Stock Count Accounting', 5]]],
    ['Asset Master Data', [['Asset Master Data Maintenance', 4]]],
  ],
  I2P: [
    ['Vendor Master Data', [['Vendor Master Data Maintenance', 6], ['Vendor Bank Data', 3]]],
    ['Invoice Processing', [['Invoice Receipt and Scanning', 8], ['Invoice Verification', 9], ['Exception Handling', 7]]],
    ['Payments', [['Payment Run', 6], ['Payment Exceptions', 4]]],
    ['Travel and Expense', [['Expense Claim Processing', 6], ['T&E Audit', 3]]],
  ],
  I2C: [
    ['Customer Master Data Management', [['Customer Creation', 5], ['Customer Change', 4], ['Credit Master Data', 3]]],
    ['Billing', [['Invoice Creation', 6], ['Credit Notes', 4]]],
    ['Cash Application', [['Incoming Payments', 6], ['Unapplied Cash', 4]]],
    ['Collections', [['Dunning', 5], ['Dispute Management', 5]]],
  ],
  ICO: [
    ['Intercompany Transactions', [['IC Invoicing', 6], ['IC Recharges', 5]]],
    ['Intercompany Reconciliation', [['IC Balance Confirmation', 5], ['IC Dispute Resolution', 4]]],
    ['Intercompany Master Data', [['IC Partner Master Data', 3]]],
  ],
};

const VERBS = ['Prepare', 'Review', 'Post', 'Approve', 'Validate', 'Reconcile', 'Archive', 'Monitor', 'Create', 'Update', 'Release', 'Check'];
const OBJECTS = ['journal', 'document', 'balance', 'request', 'batch', 'report', 'exception', 'master record', 'posting', 'file'];
const SYSTEMS = ['SAP', 'SAP / SNOW', 'SNOW', 'Blackline', 'Excel', 'Concur', 'SAP / Excel'];
const GAPS = ['NO GAP', 'NO GAP', 'NO GAP', 'NO GAP', 'NO GAP', 'HARMONIZATION GAP', 'HARMONIZATION GAP', 'STANDARDIZATION GAP', 'BOTH GAPs', 'HARMINIZATION GAP', '?', 'N/A'];

function buildRows(stream, opts = {}) {
  const rows = [];
  rows.push({ level: 0, id: stream, name: `${stream} ${({ R2R: 'Record to Report', A2R: 'Acquire to Retire', I2P: 'Invoice to Pay', I2C: 'Invoice to Cash', ICO: 'Intercompany' })[stream]}` });
  TAXONOMY[stream].forEach(([l2name, l3s], i) => {
    const l2 = `${stream} ${i + 1}`;
    rows.push({ level: 1, id: l2, name: l2name });
    l3s.forEach(([l3name, n], j) => {
      const l3 = `${l2}.${j + 1}`;
      rows.push({ level: 2, id: l3, name: l3name });
      const l3b = `${l3}.1`;
      rows.push({ level: 3, id: l3b, name: `${l3name} – standard` });
      for (let k = 1; k <= n; k++) {
        seedFor(`${l3b}.${k}|name`);
        rows.push({ level: 4, id: `${l3b}.${k}`, name: `${pick(VERBS)} ${pick(OBJECTS)} (${l3name.toLowerCase()} step ${k})`, description: `Standard activity ${k} of ${l3name}.`, l2name, l3name });
      }
    });
  });
  if (opts.filterL2) return rows.filter(r => r.level === 0 || r.id === opts.filterL2 || r.id.startsWith(opts.filterL2 + '.'));
  return rows;
}

function workbook(XLSX, stream, { headerRow, entities, asIsTitle, fitGapTitle, oosL2, rows, sheetName, oldCopy, flows, empty }) {
  const H = headerRow - 1; // 0-based index of the header row
  const aoa = []; const merges = [];
  const put = (r, c, v) => { aoa[r] = aoa[r] || []; aoa[r][c] = v; };
  put(0, 1, `Fit-Gap capture sheet – ${stream} – Demo Group France`);
  put(1, 1, 'Pre-filled by GBS Operations. Fit-Gap and Detailed Gap to be completed in the workshop.');
  let c = 1;
  const core = ['Process Level', 'Process ID', 'Process', 'Activity description'];
  core.forEach(h => put(H, c++, h));
  // To-Be block (not per entity)
  const title = (text, from, to, row = H - 3) => { put(row, from, text); if (to > from) merges.push({ s: { r: row, c: from }, e: { r: row, c: to } }); };
  const tobeStart = c;
  title('TO BE PROCESS SPECIFIC INFORMATION', c, c + 3);
  ['LE', 'GBS', 'System', 'Planned initiative'].forEach(h => put(H, c++, h));
  const cols = { tobe: { le: tobeStart, gbs: tobeStart + 1, system: tobeStart + 2, init: tobeStart + 3 }, ent: {} };
  for (const e of entities) {
    const label = `${e.code} ${e.name}${e.suffix || ''}`;
    const ec = {};
    // As-Is
    const s1 = c;
    if (asIsTitle) title(asIsTitle, c, c + 4);
    put(H - 1, s1, label);
    put(H - 2, s1, 'Activity Split As-is'); merges.push({ s: { r: H - 2, c: s1 }, e: { r: H - 2, c: s1 + 1 } });
    ['LE/Country/Other (Y/N)', 'GBS (Y/N)', 'Used Systems', 'GAP', 'Additional Information'].forEach(h => put(H, c++, h));
    ec.asis = { le: s1, gbs: s1 + 1, sys: s1 + 2, gap: s1 + 3, info: s1 + 4 };
    // Fit-Gap
    const s2 = c;
    title(fitGapTitle, c, c + 3); put(H - 1, s2, label);
    ['Local Accounting (Y/N)', 'Other', 'GBS (Y/N)', 'FTE'].forEach(h => put(H, c++, h));
    ec.fit = { local: s2, other: s2 + 1, gbs: s2 + 2, fte: s2 + 3 };
    // Detailed Gap
    const s3 = c;
    title('DETAILED GAP ASSESSMENT', c, c + 6); put(H - 1, s3, label);
    ['IT Systems', 'Workflow Tools', 'Current Process (country specifics)', 'External Party', 'Language requirements', 'Legal/Regulatory', 'Internal Controls'].forEach(h => put(H, c++, h));
    ec.det = { it: s3, wf: s3 + 1, cur: s3 + 2, ext: s3 + 3, lang: s3 + 4, legal: s3 + 5, ctrl: s3 + 6 };
    cols.ent[e.code] = ec;
  }
  const shared = ['PROCESS (SPECIFIC) INFORMATION (IF NEEDED)', 'AUTOMATION ANALYSIS', 'CHANGE IMPACT ANALYSIS', 'RACI Matrix'];
  for (const t of shared) { title(t, c, c + 1); put(H, c++, 'Comment'); put(H, c++, 'Owner'); }

  let r = H + 1;
  for (const row of rows) {
    put(r, 1, row.level); put(r, 2, row.id); put(r, 3, row.name); if (row.description) put(r, 4, row.description);
    if (row.level === 4 && !empty) {
      seedFor(row.id);
      const toGbs = rnd() < 0.7;
      put(r, cols.tobe.le, toGbs ? 'N' : 'Y'); put(r, cols.tobe.gbs, toGbs ? 'Y' : 'N'); put(r, cols.tobe.system, pick(SYSTEMS));
      if (rnd() < 0.15) put(r, cols.tobe.init, pick(['INI-017 Blackline rollout', 'INI-042 Invoice automation', 'INI-088 Global dunning policy']));
      for (const e of entities) {
        seedFor(row.id + '|' + e.code);
        const ec = cols.ent[e.code];
        const oos = oosL2 && row.id.startsWith(oosL2 + '.') && rnd() < 0.85;
        if (oos) { put(r, ec.fit.local, 'Out of scope'); put(r, ec.det.it, 'Out of scope'); continue; }
        const gbsNow = rnd() < 0.5;
        put(r, ec.asis.le, gbsNow ? 'N' : 'Y'); put(r, ec.asis.gbs, gbsNow ? 'Y' : 'N');
        put(r, ec.asis.sys, pick(SYSTEMS)); put(r, ec.asis.gap, pick(GAPS));
        if (rnd() < 0.2) put(r, ec.asis.info, pick(['Local tax requirement', 'Handled by shared mailbox', 'Manual step in Excel', 'Approval by local CFO']));
        if (rnd() < 0.02) put(r, ec.det.cur, 'to be copied into Vial and completed by GBS Ops before the session');
      }
    }
    r++;
  }
  if (rows.some(x => x.level === 4 && x.id.endsWith('.3')) && stream === 'ICO') {
    // stray header text inside data rows (real-file quirk)
    put(r - 3, 1, 'Process Level'); put(r - 3, 2, 'Process ID');
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Demo Group – Fit-Gap capture sheet'], ['Cover']]), 'Cover');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['>>']]), '>>');
  if (oldCopy) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['old copy']]), `${sheetName}_vold`);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  for (const f of flows || []) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[], [null, f.id, f.name], [`01 l ${f.name}`]]), `Process Flows_${f.tab}`);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['PROCESS CAPTURE']]), 'PROCESS CAPTURE');
  return wb;
}


/** Add one PNG per flow sheet to the xlsx package (SheetJS CE cannot write images). */
async function addFlowImages(buffer, flowSheetNames, JSZip) {
  const zip = await JSZip.loadAsync(buffer);
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  let types = await zip.file('[Content_Types].xml').async('string');
  if (!types.includes('Extension="png"')) types = types.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  let n = 0;
  for (const name of flowSheetNames) {
    const sm = wbXml.match(new RegExp(`<sheet[^>]*name="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*r:id="([^"]+)"`)); if (!sm) continue;
    const target = rels.match(new RegExp(`Id="${sm[1]}"[^>]*Target="([^"]+)"`))[1];
    const sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    const sheetFile = sheetPath.slice(sheetPath.lastIndexOf('/') + 1);
    n++;
    let xml = await zip.file(sheetPath).async('string');
    xml = xml.replace('</worksheet>', '<drawing r:id="rIdDr1"/></worksheet>');
    if (!xml.includes('xmlns:r=')) xml = xml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    zip.file(sheetPath, xml);
    zip.file(`xl/worksheets/_rels/${sheetFile}.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`);
    zip.file(`xl/drawings/drawing${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>4</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>6</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>14</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Flow ${n}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdImg1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1600000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`);
    zip.file(`xl/drawings/_rels/drawing${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${n}.png"/></Relationships>`);
    zip.file(`xl/media/image${n}.png`, DEMO_PNG_B64, { base64: true });
    types = types.replace('</Types>', `<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  }
  zip.file('[Content_Types].xml', types);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}


const rot = (arr, n) => arr.slice(n).concat(arr.slice(0, n));
const files = [
  ['R2R', { headerRow: 8, entities: ENTITIES, asIsTitle: null, fitGapTitle: 'FIT-GAP ASSESSMENT', sheetName: 'Fit-Gap Template_R2R', oldCopy: true, flows: [{ tab: 'GL', id: 'R2R 1.1', name: 'Journal Entries' }] }],
  ['A2R', { headerRow: 9, entities: rot(ENTITIES, 1), asIsTitle: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGapTitle: 'FIT-GAP ASSSSMENT', oosL2: 'A2R 2', sheetName: 'Fit-gap Template_A2R ', flows: [{ tab: 'FAA', id: 'A2R 1.1', name: 'Asset Acquisition' }] }],
  ['I2P', { headerRow: 6, entities: rot(ENTITIES, 2), asIsTitle: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGapTitle: 'FIT-GAP ASSESSMENT', oosL2: 'I2P 4', sheetName: 'Fit-Gap Template_I2P', oldCopy: true }],
  ['I2C', { headerRow: 8, entities: ENTITIES.map((e, i) => i === 2 ? { ...e, suffix: ' (incl. branch Lyon)' } : e), asIsTitle: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGapTitle: 'FIT-GAP ASSESSMENT', sheetName: 'Fit-Gap Template_I2C' }],
  ['ICO', { headerRow: 8, entities: rot(ENTITIES, 1), asIsTitle: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGapTitle: 'FIT-GAP ASSESSMENT', sheetName: 'Fit-Gap Template_ICO' }],
];

/** Returns [{ name, data: Uint8Array }] for all demo workbooks incl. I2C_CMD. */
export async function generateDemoWorkbooks(XLSX, JSZip) {
  const out = [];
  for (const [stream, o] of files) {
    seed = 42;
    const wb = workbook(XLSX, stream, { ...o, rows: buildRows(stream) });
    let data = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    if (o.flows?.length) data = await addFlowImages(data, o.flows.map(f => `Process Flows_${f.tab}`), JSZip);
    out.push({ name: `Fit-Gap_Template_${stream}_DemoGroup.xlsx`, data });
  }
  seed = 42;
  const cmdRows = buildRows('I2C', { filterL2: 'I2C 1' });
  const wbCmd = workbook(XLSX, 'I2C', { headerRow: 8, entities: ENTITIES, asIsTitle: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGapTitle: 'FIT-GAP ASSESSMENT', sheetName: 'Fit-Gap Template_I2C_CMD', rows: cmdRows });
  out.push({ name: 'Fit-Gap_Template_I2C_CMD_DemoGroup.xlsx', data: new Uint8Array(XLSX.write(wbCmd, { type: 'array', bookType: 'xlsx' })) });
  return out;
}

/** Empty capture-sheet templates (one per stream) and the planning workbook template. */
export function generateTemplateWorkbooks(XLSX, { entities = [], streams = ['R2R', 'A2R', 'I2P', 'I2C', 'ICO'] } = {}) {
  const ents = entities.length ? entities : [{ code: '100001', name: 'Entity A (replace)' }, { code: '100002', name: 'Entity B (replace)' }, { code: '100003', name: 'Entity C (replace)' }];
  const out = [];
  for (const stream of streams) {
    const L = { R2R: 'Record to Report', A2R: 'Acquire to Retire', I2P: 'Invoice to Pay', I2C: 'Invoice to Cash', ICO: 'Intercompany' }[stream] || stream;
    const rows = [
      { level: 0, id: stream, name: `${stream} ${L}` }, { level: 1, id: `${stream} 1`, name: 'Level-1 process (e.g. General Ledger Accounting)' }, { level: 2, id: `${stream} 1.1`, name: 'Level-2 process (e.g. Journal Entries)' }, { level: 3, id: `${stream} 1.1.1`, name: 'Level-3 process variant (e.g. Journal Entries – standard)' },
      { level: 4, id: `${stream} 1.1.1.1`, name: 'Level-4 activity (one row per activity)', description: 'What is done in this activity – one sentence.' }, { level: 4, id: `${stream} 1.1.1.2`, name: 'Next activity', description: '' },
    ];
    const wb = workbook(XLSX, stream, { headerRow: 8, entities: ents, asIsTitle: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGapTitle: 'FIT-GAP ASSESSMENT', rows, sheetName: `Fit-Gap Template_${stream}`, empty: true });
    const ws = wb.Sheets[`Fit-Gap Template_${stream}`];
    ws['B2'] = { t: 's', v: 'How to fill: keep the header row (row 8) and the block titles above it. One row per activity (Process Level 4). GBS Operations pre-fill the AS-IS block per entity (LE/Country/Other, GBS, Used Systems, GAP = NO GAP | HARMONIZATION GAP | STANDARDIZATION GAP | BOTH GAPS, Additional Information). Leave FIT-GAP and DETAILED GAP empty – they are completed in the workshop. Write "Out of scope" into the Fit-Gap cell of an entity to exclude an activity.' };
    out.push({ name: `Fit-Gap_Template_${stream}.xlsx`, data: new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })) });
  }
  const plan = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(plan, XLSX.utils.aoa_to_sheet([['Fit Gap Workshops'], [], ['Country', 'PROCESS', 'Responsible', 'Comment', 'Workshop Date', 'Meeting time', 'Overall Duration', 'Status'], ['France', 'Record-to-Report', 'J. Keller', '', '19.10.2026 and 20.10.2026', 'Monday from 10:00-12:00 and 13:00-16:00', '5h', 'confirmed with PE and RO'], ['', 'Invoice-to-Pay', 'A. Weber', 'tbc', '21.10.2026', '9:00-11:00 CET', '2h', 'invite sent'], ['UK&I', 'Order-to-Cash', 'C. Smith', '', 'tbd', 'tbd', '', '']]), 'New');
  XLSX.utils.book_append_sheet(plan, XLSX.utils.aoa_to_sheet([['Old']]), 'Old');
  out.push({ name: 'Fit_Gap_Workshops_planning_template.xlsx', data: new Uint8Array(XLSX.write(plan, { type: 'array', bookType: 'xlsx' })) });
  out.push({ name: 'README.txt', data: new TextEncoder().encode(`GBS Fit-Gap Workbench – Excel templates\n\nFit-Gap_Template_<STREAM>.xlsx\n  One workbook per stream (R2R, A2R, I2P, I2C, ICO). Main sheet "Fit-Gap Template_<STREAM>":\n  - row 8 = header row (Process Level | Process ID | Process | Activity description), rows 5-7 carry the block titles and entity labels\n  - TO BE block: LE, GBS, System, Planned initiative (per activity)\n  - per entity: PRE-FILLED AS-IS (LE/Country/Other, GBS, Used Systems, GAP, Additional Information) – filled by GBS Operations before the workshop\n  - per entity: FIT-GAP ASSESSMENT (Local Accounting, Other, GBS, FTE) and DETAILED GAP ASSESSMENT (7 fields) – completed in the workshop\n  - entity label above each block = "<6-digit code> <legal entity name>"\n  - data rows: Process Level 0-5 and Process ID starting with the stream code; levels 0-3 are hierarchy, level 4 = activities\n  - "Out of scope" in a Fit-Gap cell excludes the activity for that entity\n  You may add rows, entities (copy the three blocks and change the label) and extra columns – the parser maps fields by header text, not by column letter.\n\nFit_Gap_Workshops_planning_template.xlsx\n  Planning workbook ("New" sheet): Country | PROCESS | Responsible | Comment | Workshop Date | Meeting time | Overall Duration | Status. Free-text dates and times are parsed best-effort.\n`) });
  return out;
}

export const DEMO_LOGO = 'data:image/svg+xml;base64,' + (typeof btoa === 'function' ? btoa : (s) => Buffer.from(s).toString('base64'))(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 96"><rect x="4" y="8" width="80" height="80" rx="18" fill="#0f6e56"/><path d="M24 62V34h18a10 10 0 0 1 0 20H24M24 48h18M58 34v28" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><text x="104" y="64" font-family="Georgia, 'Source Serif 4', serif" font-size="46" font-weight="600" fill="#0f6e56">Demo Group</text></svg>`);
export const DEMO_PLAN = {
  clientName: 'Demo Group', country: 'France', editorInitials: 'FG', logoDataUrl: DEMO_LOGO, brandColor: '#0f6e56',
  participants: [['Marie Dupont', 'GL lead', 'Local', '301001', 'onsite'], ['Luc Bernard', 'AP accountant', 'Local', '301002', 'online'], ['Anna Weber', 'Ops team lead', 'GBS Ops', null, 'online'], ['Jonas Keller', 'Process expert R2R', 'Process Expert', null, 'onsite']],
  sessions: [['R2R', '14:00', '15:30'], ['I2P', '16:00', '17:30'], ['MD', '09:00', '10:00']],
};
