// Process-flow image extraction from "Process Flows_*" sheets via JSZip:
// workbook.xml → sheet part → drawing part → anchors (row) + blips → media.
// Each image is assigned to the nearest label above its anchor row; the label
// is mapped to a process node by ID, else by fuzzy name.
import { normText, fuzzyKey, similarity } from '../model/normalize.js';

const attr = (xml, name) => { const m = xml.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : null; };
const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1);
function resolvePath(base, target) { if (target.startsWith('/')) return target.slice(1); const parts = (dirOf(base) + target).split('/'); const out = []; for (const x of parts) { if (x === '..') out.pop(); else if (x !== '.' && x !== '') out.push(x); } return out.join('/'); }
function parseRels(xml) { const out = {}; for (const m of (xml || '').matchAll(/<Relationship\b[^>]*>/g)) { const id = attr(m[0], 'Id'), target = attr(m[0], 'Target'); if (id && target) out[id] = target; } return out; }
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', emf: 'image/emf', wmf: 'image/wmf', svg: 'image/svg+xml', bmp: 'image/bmp' };

/** Sheet name → part path, from workbook.xml + its rels. */
export async function sheetParts(zip) {
  const wb = await zip.file('xl/workbook.xml')?.async('string'); if (!wb) return {};
  const rels = parseRels(await zip.file('xl/_rels/workbook.xml.rels')?.async('string'));
  const out = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) { const name = attr(m[0], 'name'), rid = attr(m[0], 'r:id') || attr(m[0], 'id'); if (name && rid && rels[rid]) out[name] = resolvePath('xl/workbook.xml', rels[rid]); }
  return out;
}

/** Images of one sheet: [{ row, col, dataUrl, mime, bytes }] sorted by row. */
export async function sheetImages(zip, sheetPath) {
  const sheetXml = await zip.file(sheetPath)?.async('string'); if (!sheetXml) return [];
  const dm = sheetXml.match(/<drawing\b[^>]*r:id="([^"]+)"/); if (!dm) return [];
  const sheetRels = parseRels(await zip.file(`${dirOf(sheetPath)}_rels/${sheetPath.slice(sheetPath.lastIndexOf('/') + 1)}.rels`)?.async('string'));
  const drawingPath = sheetRels[dm[1]] ? resolvePath(sheetPath, sheetRels[dm[1]]) : null; if (!drawingPath) return [];
  const drawing = await zip.file(drawingPath)?.async('string'); if (!drawing) return [];
  const drels = parseRels(await zip.file(`${dirOf(drawingPath)}_rels/${drawingPath.slice(drawingPath.lastIndexOf('/') + 1)}.rels`)?.async('string'));
  const out = [];
  for (const m of drawing.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g)) {
    const a = m[0];
    const row = Number((a.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/) || [])[1] ?? 0);
    const col = Number((a.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/) || [])[1] ?? 0);
    const blip = a.match(/<a:blip\b[^>]*r:embed="([^"]+)"/); if (!blip || !drels[blip[1]]) continue;
    const mediaPath = resolvePath(drawingPath, drels[blip[1]]);
    const file = zip.file(mediaPath); if (!file) continue;
    const ext = mediaPath.slice(mediaPath.lastIndexOf('.') + 1).toLowerCase();
    const b64 = await file.async('base64');
    out.push({ row, col, mediaPath, mime: MIME[ext] || 'application/octet-stream', dataUrl: `data:${MIME[ext] || 'application/octet-stream'};base64,${b64}`, bytes: Math.round(b64.length * 0.75) });
  }
  return out.sort((x, y) => x.row - y.row);
}

const ID_RX = /^((?:R2R|A2R|I2P|I2C|ICO)\s*[\d.]*)\s*(.*)$/i;
const NUM_RX = /^\d{1,2}\s*[l|.\-–]\s*(.+)$/;

/** Labels in a flow sheet grid: [{ row, id, name, text }]. */
export function flowLabels(grid) {
  const out = [];
  for (let r = 0; r < grid.rows.length; r++) {
    const row = grid.rows[r] || [];
    for (let c = 0; c < Math.min(row.length, 6); c++) {
      const t = normText(row[c]); if (!t || t.length > 120) continue;
      let m = t.match(ID_RX);
      if (m && /\d/.test(m[1])) { const name = normText(m[2]) || normText(row[c + 1]) || normText(row[c + 2]); out.push({ row: r, id: normText(m[1]).replace(/\s+/g, ' '), name, text: t }); break; }
      m = t.match(NUM_RX);
      if (m) { out.push({ row: r, id: null, name: normText(m[1]), text: t }); break; }
    }
  }
  return out;
}

/** Map a label to a process node (level 1–3). Returns { nodeId, score } or null. */
export function matchLabel(label, processes, stream) {
  const nodes = Object.values(processes).filter(p => p.level >= 1 && p.level <= 3 && (!stream || p.stream === stream));
  if (label.id) { const k = fuzzyKey(label.id); const hit = nodes.find(p => fuzzyKey(p.id) === k); if (hit) return { nodeId: hit.id, score: 1 }; }
  if (!label.name) return null;
  let best = null;
  for (const p of nodes) { const s = similarity(label.name, p.name); if (!best || s > best.score) best = { nodeId: p.id, score: s }; }
  return best && best.score >= 0.6 ? best : null;
}

/**
 * Extract every flow image of a workbook. grids: { sheetName: grid } for the flow
 * sheets (from sheetToGrid). Returns [{ sheet, row, label, nodeId, score, dataUrl, mime }].
 */
export async function extractFlows(zip, flowSheetNames, grids, processes, { stream = null, fileName = '' } = {}) {
  const parts = await sheetParts(zip);
  const out = [];
  for (const sheet of flowSheetNames) {
    const path = parts[sheet] || parts[normText(sheet)] || Object.entries(parts).find(([n]) => normText(n) === normText(sheet))?.[1];
    if (!path) continue;
    const images = await sheetImages(zip, path);
    const labels = grids[sheet] ? flowLabels(grids[sheet]) : [];
    for (const img of images) {
      const label = labels.filter(l => l.row <= img.row).sort((a, b) => b.row - a.row)[0] || null;
      const match = label ? matchLabel(label, processes, stream) : null;
      out.push({ id: `${fileName}::${sheet}::${img.row}`, file: fileName, sheet, row: img.row + 1, label: label ? label.text : '', labelId: label?.id || null, nodeId: match?.nodeId || null, score: match?.score || 0, stream, dataUrl: img.dataUrl, mime: img.mime, bytes: img.bytes });
    }
  }
  return out;
}
