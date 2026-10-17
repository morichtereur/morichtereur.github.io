// Planning workbook ("Fit Gap Workshops"): Country | PROCESS | Responsible |
// Comment | Workshop Date | Meeting time | Overall Duration | Status, several
// countries in one sheet, sheets "New"/"Old" (use "New"). Free-text dates and
// times are parsed best-effort; anything unparsed is flagged for the review table.
import { normText, fuzzyKey } from '../model/normalize.js';

const STREAM_BY_PROCESS = [
  [/record.?to.?report|\bR2R\b|general ledger/i, 'R2R'],
  [/invoice.?to.?pay|procure.?to.?pay|\bI2P\b|\bP2P\b|accounts payable/i, 'I2P'],
  [/order.?to.?cash|invoice.?to.?cash|\bI2C\b|\bO2C\b|accounts receivable/i, 'I2C'],
  [/acquire.?to.?retire|\bA2R\b|fixed asset|inventory/i, 'A2R'],
  [/master.?data|\bMD\b|\bMDM\b/i, 'MD'],
  [/travel|expense|T&E|\bTE\b/i, 'I2P T&E'],
  [/intercompany|\bICO\b|\bIC\b/i, 'ICO'],
];
export function streamFromProcessName(name) {
  const t = normText(name);
  for (const [rx, s] of STREAM_BY_PROCESS) if (rx.test(t)) return s;
  return null;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
/** Extract ISO dates from free text (dd.mm.yyyy, dd/mm/yyyy, yyyy-mm-dd, "19 Oct 2026", "Oct 19, 2026", Excel serials). */
export function extractDates(raw) {
  if (raw instanceof Date) return [isoDate(raw)];
  if (typeof raw === 'number' && raw > 30000 && raw < 80000) { const d = new Date(Math.round((raw - 25569) * 86400000)); return [isoDate(d, true)]; }
  const t = normText(raw); const out = [];
  for (const m of t.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/g)) out.push(mk(m[3], m[2], m[1]));
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push(mk(m[1], m[2], m[3]));
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/g)) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) out.push(mk(m[3], mo, m[1])); }
  for (const m of t.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) out.push(mk(m[3], mo, m[2])); }
  return [...new Set(out.filter(Boolean))];
}
function mk(y, mo, d) { y = String(y); if (y.length === 2) y = '20' + y; mo = Number(mo); d = Number(d); if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function isoDate(d, utc = false) { return utc ? d.toISOString().slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/** Extract time ranges from free text: "10:00-12:00", "9.00 – 11.30", "13:00 to 16:00", "2-4 pm", "9am-11am". Returns [{start,end,tz}]. */
export function extractTimeRanges(raw) {
  const t = normText(raw).replace(/–|—/g, '-');
  const out = [];
  const tz = (t.match(/\b(CET|CEST|UTC|GMT|KST|JST|PHT|SGT|IST|EST|PST|BST)\b/i) || [])[1] || null;
  const rx = /(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?\s*(?:-|to|until|bis)\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?/gi;
  for (const m of t.matchAll(rx)) {
    let h1 = Number(m[1]), m1 = Number(m[2] || 0), h2 = Number(m[4]), m2 = Number(m[5] || 0);
    const ap1 = (m[3] || '').toLowerCase(), ap2 = (m[6] || '').toLowerCase();
    if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) continue;
    if ((ap2 === 'pm' || (!ap2 && ap1 === 'pm')) && h2 < 12) h2 += 12;
    if ((ap1 === 'pm') && h1 < 12) h1 += 12;
    if (!ap1 && ap2 === 'pm' && h1 < 12 && h1 + 12 < h2) h1 += 12; // "2-4 pm"

    if (!ap1 && !ap2 && h1 < 8 && h2 <= 12 && m[2] === undefined && m[5] === undefined) { /* "2-4" without am/pm – ambiguous, keep as given */ }
    if (h2 * 60 + m2 <= h1 * 60 + m1) continue;
    out.push({ start: `${String(h1).padStart(2, '0')}:${String(m1).padStart(2, '0')}`, end: `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`, tz });
  }
  return out;
}

const COLS = { country: ['country'], process: ['process', 'stream', 'process area'], responsible: ['responsible', 'process expert', 'owner', 'expert'], comment: ['comment', 'comments', 'remarks'], date: ['workshop date', 'date', 'dates'], time: ['meeting time', 'time', 'time slot'], duration: ['overall duration', 'duration'], status: ['status'] };

/** Parse the planning workbook. Returns { ok, sheetName, countries[], rows[], sessions[], warnings[] }. */
export function parsePlanningWorkbook(wb, { XLSX, fileName = 'planning.xlsx' } = {}) {
  const names = wb.SheetNames;
  const sheetName = names.find(n => fuzzyKey(n) === 'new') || names.find(n => !/old/i.test(n)) || names[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const warnings = [];
  let header = -1, map = {};
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const m = {}; const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) { const k = fuzzyKey(row[c]); if (!k) continue; for (const [f, syns] of Object.entries(COLS)) if (m[f] === undefined && syns.some(s => fuzzyKey(s) === k)) m[f] = c; }
    if (m.country !== undefined && m.process !== undefined) { header = r; map = m; break; }
  }
  if (header < 0) return { ok: false, fileName, sheetName, warnings: [{ level: 'error', code: 'NO_HEADER', message: `No header row with "Country" and "PROCESS" found in sheet "${sheetName}".` }] };
  for (const f of ['date', 'time']) if (map[f] === undefined) warnings.push({ level: 'warn', code: 'COL_MISSING', message: `Column "${f}" not found – sessions will need manual dates/times.` });
  const out = []; let lastCountry = '';
  for (let r = header + 1; r < rows.length; r++) {
    const row = rows[r]; const get = (f) => map[f] === undefined ? null : row[map[f]];
    const country = normText(get('country')) || lastCountry; const process = normText(get('process'));
    if (!process && !normText(get('country'))) continue;
    if (!process) continue;
    lastCountry = country;
    const dateRaw = get('date'), timeRaw = get('time');
    const dates = extractDates(dateRaw), times = extractTimeRanges(normText(timeRaw) + ' ' + (typeof dateRaw === 'string' ? dateRaw : ''));
    const stream = streamFromProcessName(process);
    const rec = { row: r + 1, country, process, stream, responsible: normText(get('responsible')), comment: normText(get('comment')), dateRaw: dateRaw instanceof Date ? dateRaw.toISOString() : normText(dateRaw), timeRaw: normText(timeRaw), duration: normText(get('duration')), status: normText(get('status')), dates, times, issues: [] };
    if (!stream) rec.issues.push('stream');
    if (!dates.length) rec.issues.push('date');
    if (!times.length) rec.issues.push('time');
    out.push(rec);
  }
  const sessions = [];
  for (const rec of out) {
    const dates = rec.dates.length ? rec.dates : [''];
    const times = rec.times.length ? rec.times : [{ start: '', end: '' }];
    // Pair dates with time ranges: equal counts → pairwise; else every date gets every range.
    const pairs = dates.length === times.length && dates.length > 1 ? dates.map((d, i) => [d, times[i]]) : dates.flatMap(d => times.map(t => [d, t]));
    for (const [date, t] of pairs) sessions.push({ country: rec.country, stream: rec.stream || '', process: rec.process, date, start: t.start, end: t.end, tz: t.tz || null, responsible: rec.responsible, status: rec.status, comment: rec.comment, source: { file: fileName, row: rec.row }, incomplete: !rec.stream || !date || !t.start });
  }
  const countries = [...new Set(out.map(r => r.country).filter(Boolean))];
  return { ok: true, fileName, sheetName, countries, rows: out, sessions, warnings };
}
