#!/usr/bin/env node
// Demo data generator: fictional "Demo Group" capture workbooks with the same
// structure as the real capture sheets (header row at 6/8/9, block titles with
// the known spelling variants, 3 entities in varying order, Out-of-scope rows,
// GAP typos, instruction text, an old sheet copy, flow sheets) so the tool can
// be shown and tested without client data. Written with SheetJS.
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(process.argv[2] || 'samples/demo');
mkdirSync(OUT, { recursive: true });

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

function workbook(stream, { headerRow, entities, asIsTitle, fitGapTitle, oosL2, rows, sheetName, oldCopy, flows }) {
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
    if (row.level === 4) {
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

// Tiny PNG (a 160×90 blue-grey box) used as the BPMN image in flow sheets.
function demoPng() {
  const w = 160, h = 90; const raw = []; for (let y = 0; y < h; y++) { raw.push(0); for (let x = 0; x < w; x++) { const edge = x < 3 || y < 3 || x >= w - 3 || y >= h - 3; raw.push(edge ? 0x1f : 0xe8, edge ? 0x4e : 0xed, edge ? 0x79 : 0xf1); } }
  const crc = (buf) => { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const { deflateSync } = require('node:zlib');
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0))]);
}
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);

/** Add one PNG per flow sheet to the xlsx package (SheetJS CE cannot write images). */
async function addFlowImages(buffer, flowSheetNames) {
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
    zip.file(`xl/media/image${n}.png`, demoPng());
    types = types.replace('</Types>', `<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  }
  zip.file('[Content_Types].xml', types);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const rot = (arr, n) => arr.slice(n).concat(arr.slice(0, n));
const files = [
  ['R2R', { headerRow: 8, entities: ENTITIES, asIsTitle: null, fitGapTitle: 'FIT-GAP ASSESSMENT', sheetName: 'Fit-Gap Template_R2R', oldCopy: true, flows: [{ tab: 'GL', id: 'R2R 1.1', name: 'Journal Entries' }] }],
  ['A2R', { headerRow: 9, entities: rot(ENTITIES, 1), asIsTitle: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGapTitle: 'FIT-GAP ASSSSMENT', oosL2: 'A2R 2', sheetName: 'Fit-gap Template_A2R ', flows: [{ tab: 'FAA', id: 'A2R 1.1', name: 'Asset Acquisition' }] }],
  ['I2P', { headerRow: 6, entities: rot(ENTITIES, 2), asIsTitle: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGapTitle: 'FIT-GAP ASSESSMENT', oosL2: 'I2P 4', sheetName: 'Fit-Gap Template_I2P', oldCopy: true }],
  ['I2C', { headerRow: 8, entities: ENTITIES.map((e, i) => i === 2 ? { ...e, suffix: ' (incl. branch Lyon)' } : e), asIsTitle: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGapTitle: 'FIT-GAP ASSESSMENT', sheetName: 'Fit-Gap Template_I2C' }],
  ['ICO', { headerRow: 8, entities: rot(ENTITIES, 1), asIsTitle: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGapTitle: 'FIT-GAP ASSESSMENT', sheetName: 'Fit-Gap Template_ICO' }],
];
for (const [stream, o] of files) {
  const wb = workbook(stream, { ...o, rows: buildRows(stream) });
  const file = resolve(OUT, `Fit-Gap_Template_${stream}_DemoGroup.xlsx`);
  let buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  if (o.flows?.length) buf = await addFlowImages(buf, o.flows.map(f => `Process Flows_${f.tab}`));
  writeFileSync(file, buf);
  console.log('wrote', file);
}
// I2C_CMD: subset of I2C (customer master data L2) for the separate Master Data session.
seed = 42;
const cmdRows = buildRows('I2C', { filterL2: 'I2C 1' });
const wbCmd = workbook('I2C', { headerRow: 8, entities: ENTITIES, asIsTitle: 'PRE-FILLED AS-IS PROCESS SPECIFICATION', fitGapTitle: 'FIT-GAP ASSESSMENT', sheetName: 'Fit-Gap Template_I2C_CMD', rows: cmdRows });
const cmdFile = resolve(OUT, 'Fit-Gap_Template_I2C_CMD_DemoGroup.xlsx');
writeFileSync(cmdFile, XLSX.write(wbCmd, { type: 'buffer', bookType: 'xlsx' }));
console.log('wrote', cmdFile);
