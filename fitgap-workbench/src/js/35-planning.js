/* ---------------------------------------------------------------------------
 * 35-planning.js – optional import of the programme planning workbook
 * ("Fit Gap Workshops"): Country | PROCESS | Responsible | Comment |
 * Workshop Date | Meeting time | Overall Duration | Status. Sheet "New"
 * preferred. Free-text dates/times → best-effort sessions for review.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG || (root.FG = {});
  const U = FG.util;

  const STREAM_MAP = [
    [/record.?to.?report|\bR2R\b/i, 'R2R'], [/invoice.?to.?pay|purchase.?to.?pay|\bI2P\b|\bP2P\b/i, 'I2P'], [/order.?to.?cash|invoice.?to.?cash|\bI2C\b|\bO2C\b/i, 'I2C'],
    [/acquire.?to.?retire|\bA2R\b|fixed.?asset/i, 'A2R'], [/master.?data|\bMD\b|\bMDM\b/i, 'MD'], [/travel|expense|T&E/i, 'I2P'], [/intercompany|\bICO\b|\bIC\b/i, 'ICO'],
  ];
  function mapStream(text) { for (const [re, s] of STREAM_MAP) if (re.test(text || '')) return s; return ''; }

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  function pad(n) { return String(n).padStart(2, '0'); }
  function excelDate(n) { const d = new Date(Math.round((n - 25569) * 86400 * 1000)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  /** All dates in a cell → ['YYYY-MM-DD', …] */
  function parseDates(v, defaultYear) {
    if (v === null || v === undefined || v === '') return [];
    if (typeof v === 'number') return v > 20000 && v < 80000 ? [excelDate(v)] : [];
    if (v instanceof Date) return [v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate())];
    const t = String(v), out = [];
    let m; const re1 = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/g;
    while ((m = re1.exec(t))) { let y = +m[3]; if (y < 100) y += 2000; out.push(y + '-' + pad(+m[2]) + '-' + pad(+m[1])); }
    const re2 = /(\d{4})-(\d{2})-(\d{2})/g; while ((m = re2.exec(t))) out.push(m[1] + '-' + m[2] + '-' + m[3]);
    const re3 = /(\d{1,2})\.?\s*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s*(\d{4})?/gi;
    while ((m = re3.exec(t))) { const y = m[3] ? +m[3] : defaultYear; out.push(y + '-' + pad(MONTHS[m[2].toLowerCase().slice(0, m[2].toLowerCase() === 'sept' ? 4 : 3)] || 1) + '-' + pad(+m[1])); }
    return Array.from(new Set(out));
  }
  /** All time ranges in a cell → [{start:'HH:MM', end:'HH:MM'}], plus a time-zone note. */
  function parseTimes(v) {
    if (v === null || v === undefined || v === '') return { ranges: [], tz: '' };
    const t = String(v), ranges = [];
    const norm = (h, mnt, ap) => { h = +h; mnt = mnt ? +mnt : 0; if (ap) { ap = ap.toLowerCase(); if (ap.startsWith('p') && h < 12) h += 12; if (ap.startsWith('a') && h === 12) h = 0; } return pad(h) + ':' + pad(mnt); };
    const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|h)?\s*(?:-|–|to|bis)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|h)?/gi; let m;
    while ((m = re.exec(t))) ranges.push({ start: norm(m[1], m[2], m[3]), end: norm(m[4], m[5], m[6]) });
    const tz = (t.match(/\b(CET|CEST|UTC|GMT|KST|JST|EST|PST|BST|IST|SGT|PHT|HKT)\b/i) || [''])[0].toUpperCase();
    return { ranges, tz };
  }
  function parseDuration(v) { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return v < 1 ? Math.round(v * 24 * 60) : (v <= 12 ? Math.round(v * 60) : Math.round(v)); const t = String(v); const h = t.match(/(\d+(?:[.,]\d+)?)\s*h/i), mi = t.match(/(\d+)\s*m/i); let mins = 0; if (h) mins += Math.round(parseFloat(h[1].replace(',', '.')) * 60); if (mi) mins += +mi[1]; if (!h && !mi) { const n = parseFloat(t.replace(',', '.')); if (!isNaN(n)) mins = n <= 12 ? n * 60 : n; } return mins || null; }

  const COLS = { country: ['Country'], process: ['PROCESS', 'Process', 'Stream'], responsible: ['Responsible', 'Process Expert', 'Owner'], comment: ['Comment', 'Comments', 'Remarks'], date: ['Workshop Date', 'Date', 'Workshop dates'], time: ['Meeting time', 'Time', 'Meeting times'], duration: ['Overall Duration', 'Duration'], status: ['Status'] };

  /** parsePlanningWorkbook(wb, { year }) → { ok, sheet, rows:[{country, process, stream, responsible, comment, dateRaw, timeRaw, dates, times, tz, durationMin, status, sessions:[{date,start,end}], flags:[]}], warnings } */
  function parsePlanningWorkbook(wb, opts) {
    const XLSX = root.XLSX; opts = opts || {};
    const year = opts.year || new Date().getFullYear();
    const name = wb.SheetNames.find(n => /^new$/i.test(n.trim())) || wb.SheetNames.find(n => !/^old$/i.test(n.trim())) || wb.SheetNames[0];
    const ws = wb.Sheets[name];
    const ref = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false, range: { s: { r: 0, c: 0 }, e: ref.e } });
    // header row = row with most column matches
    let hr = -1, best = 0, map = {};
    for (let r = 0; r < Math.min(grid.length, 20); r++) {
      const row = grid[r] || []; const m = {}; let score = 0;
      for (let c = 0; c < row.length; c++) { const t = U.clean(row[c]); if (!t) continue; for (const k in COLS) if (m[k] === undefined && COLS[k].some(s => U.key(s) === U.key(t) || (U.key(t).length >= 4 && U.has(t, s)))) { m[k] = c; score++; break; } }
      if (score > best) { best = score; hr = r; map = m; }
    }
    if (hr < 0 || map.process === undefined || map.date === undefined) return { ok: false, error: 'Could not find the header row (needs at least "PROCESS" and "Workshop Date") in sheet "' + name + '".' };
    const rows = [], warnings = [];
    let lastCountry = '';
    for (let r = hr + 1; r < grid.length; r++) {
      const row = grid[r] || []; const get = (k) => map[k] === undefined ? null : row[map[k]];
      const process = U.clean(get('process')); const dateRaw = get('date');
      if (!process && !dateRaw) continue;
      const country = U.clean(get('country')) || lastCountry; if (U.clean(get('country'))) lastCountry = country;
      const dates = parseDates(dateRaw, year), times = parseTimes(get('time')), durationMin = parseDuration(get('duration'));
      const flags = [];
      const sessions = [];
      if (!dates.length) flags.push('no date recognised');
      if (!times.ranges.length) flags.push('no time recognised');
      if (dates.length && times.ranges.length) {
        if (dates.length === times.ranges.length) dates.forEach((d, i) => sessions.push({ date: d, ...times.ranges[i] }));
        else if (dates.length === 1) times.ranges.forEach(t => sessions.push({ date: dates[0], ...t }));
        else if (times.ranges.length === 1) dates.forEach(d => sessions.push({ date: d, ...times.ranges[0] }));
        else { dates.forEach(d => times.ranges.forEach(t => sessions.push({ date: d, ...t }))); flags.push('several dates × several times – check'); }
      } else if (dates.length) dates.forEach(d => sessions.push({ date: d, start: '', end: '' }));
      else sessions.push({ date: '', start: times.ranges[0] ? times.ranges[0].start : '', end: times.ranges[0] ? times.ranges[0].end : '' });
      if (times.tz && times.tz !== 'CET' && times.tz !== 'CEST') flags.push('time zone ' + times.tz);
      rows.push({ row: r + 1, country, process, stream: mapStream(process), responsible: U.clean(get('responsible')), comment: U.clean(get('comment')), dateRaw: U.clean(dateRaw), timeRaw: U.clean(get('time')), dates, times: times.ranges, tz: times.tz, durationMin, status: U.clean(get('status')), sessions, flags });
    }
    if (!rows.length) warnings.push('No planning rows found below the header.');
    return { ok: true, sheet: name, headerRow: hr + 1, columns: map, rows, warnings };
  }

  FG.planning = { parsePlanningWorkbook, parseDates, parseTimes, parseDuration, mapStream };
})(typeof globalThis !== 'undefined' ? globalThis : window);
