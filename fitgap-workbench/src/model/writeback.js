// Write-back of workshop results into the ORIGINAL workbooks: the sheet XML is
// patched cell by cell inside the xlsx package (JSZip). Formatting, images,
// data validations and merged cells are untouched; values are inline strings.
import { DETAILED_GAP_FIELDS } from './constants.js';
import { sheetParts } from '../parser/flows.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function colIndex(ref) { const m = ref.match(/^([A-Z]+)/); let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
const rowOf = (ref) => Number(ref.match(/\d+$/)[0]);

function cellXml(ref, value, style) {
  const s = style ? ` s="${style}"` : '';
  if (value === null || value === undefined || value === '') return `<c r="${ref}"${s}/>`;
  if (typeof value === 'number') return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

/** Patch cells in a worksheet XML string. cells: { 'AB12': 'Y' | 0.5 | '' }. Returns { xml, written }. */
export function patchSheetXml(xml, cells) {
  const byRow = {};
  for (const [ref, v] of Object.entries(cells)) { const r = rowOf(ref); (byRow[r] = byRow[r] || []).push([ref, v]); }
  let written = 0;
  const rowNums = Object.keys(byRow).map(Number).sort((a, b) => a - b);
  for (const rn of rowNums) {
    const rowRx = new RegExp(`<row\\b[^>]*\\br="${rn}"[^>]*?(?:/>|>([\\s\\S]*?)</row>)`);
    const m = xml.match(rowRx);
    const targets = byRow[rn].sort((a, b) => colIndex(a[0]) - colIndex(b[0]));
    if (!m) {
      // Row absent: insert a new row in order inside sheetData.
      const newRow = `<row r="${rn}">${targets.map(([ref, v]) => cellXml(ref, v)).join('')}</row>`;
      written += targets.length;
      const rows = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)];
      const after = rows.find(x => Number(x[1]) > rn);
      if (after) xml = xml.slice(0, after.index) + newRow + xml.slice(after.index);
      else if (xml.includes('</sheetData>')) xml = xml.replace('</sheetData>', newRow + '</sheetData>');
      else xml = xml.replace('<sheetData/>', `<sheetData>${newRow}</sheetData>`);
      continue;
    }
    let rowXml = m[0];
    const selfClosing = rowXml.endsWith('/>');
    let open = selfClosing ? rowXml.slice(0, -2) + '>' : rowXml.slice(0, rowXml.indexOf('>') + 1);
    let inner = selfClosing ? '' : m[1];
    for (const [ref, v] of targets) {
      const cellRx = new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
      const cm = inner.match(cellRx);
      if (cm) { const style = (cm[0].match(/\bs="(\d+)"/) || [])[1]; inner = inner.replace(cm[0], cellXml(ref, v, style)); }
      else {
        const existing = [...inner.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"/g)];
        const after = existing.find(x => colIndex(x[1]) > colIndex(ref));
        const piece = cellXml(ref, v);
        inner = after ? inner.slice(0, after.index) + piece + inner.slice(after.index) : inner + piece;
      }
      written++;
    }
    open = open.replace(/\sspans="[^"]*"/, '');
    xml = xml.replace(rowXml, `${open}${inner}</row>`);
  }
  return { xml, written };
}

const ynCell = (v) => v === true ? 'Y' : v === false ? 'N' : null;

/** Cells to write for one file: { sheetName: { ref: value } }. Only assessments touched in the workshop. */
export function writeBackCells(session, fileName, { onlyTouched = true } = {}) {
  const out = {};
  for (const a of Object.values(session.assessments)) {
    if (onlyTouched && !a.workshop.changedAt) continue;
    for (const src of a.sources) {
      if (src.file !== fileName) continue;
      const sheet = out[src.sheet] = out[src.sheet] || {};
      const fg = src.cells.fitGap || {}, dg = src.cells.detailedGap || {};
      if (a.scope.outOfScope && a.scope.source === 'workshop') { if (fg.local) sheet[fg.local] = 'Out of scope'; continue; }
      for (const f of ['local', 'other', 'gbs']) { const v = ynCell(a.fitGap[f]); if (fg[f] && v !== null) sheet[fg[f]] = v; }
      if (fg.fte && a.fitGap.fte !== null && a.fitGap.fte !== undefined) sheet[fg.fte] = a.fitGap.fte;
      for (const f of DETAILED_GAP_FIELDS) if (dg[f] && a.detailedGap[f]) sheet[dg[f]] = a.detailedGap[f];
    }
  }
  return out;
}

/** Patch the original workbook (JSZip instance). Returns { zip, written, sheets }. */
export async function writeBackWorkbook(zip, session, fileName, opts = {}) {
  const cells = writeBackCells(session, fileName, opts);
  const parts = await sheetParts(zip);
  let written = 0; const sheets = [];
  for (const [sheetName, map] of Object.entries(cells)) {
    const path = parts[sheetName] || Object.entries(parts).find(([n]) => n.trim() === sheetName.trim())?.[1];
    if (!path) { sheets.push({ sheetName, error: 'sheet not found in workbook' }); continue; }
    const xml = await zip.file(path).async('string');
    const res = patchSheetXml(xml, map);
    zip.file(path, res.xml);
    written += res.written; sheets.push({ sheetName, path, written: res.written });
  }
  // Drop the calc chain so Excel never complains about stale references.
  if (zip.file('xl/calcChain.xml')) { zip.remove('xl/calcChain.xml'); const ct = await zip.file('[Content_Types].xml').async('string'); zip.file('[Content_Types].xml', ct.replace(/<Override[^>]*calcChain\.xml"[^>]*\/>/, '')); const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string'); zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship[^>]*calcChain\.xml"[^>]*\/>/, '')); }
  return { zip, written, sheets };
}
