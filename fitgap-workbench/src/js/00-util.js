/* ---------------------------------------------------------------------------
 * 00-util.js – shared helpers. Everything lives on the FG namespace so the
 * same files run inlined in the browser and under Node (tests / build).
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG || (root.FG = {});

  /** Collapse whitespace (incl. NBSP), trim. Returns '' for null/undefined. */
  function clean(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[ \s]+/g, ' ').trim();
  }
  /** Lowercase alphanumerics only – used for all fuzzy header matching. */
  function key(v) {
    return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }
  /** Fuzzy "a contains b" on normalised keys. */
  function has(hay, needle) {
    const h = key(hay), n = key(needle);
    return n.length > 0 && h.indexOf(n) !== -1;
  }
  /** Damerau-free Levenshtein, enough for short labels. */
  function lev(a, b) {
    a = key(a); b = key(b);
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }
  /** Similarity 0..1 on normalised keys. */
  function sim(a, b) {
    const ka = key(a), kb = key(b);
    if (!ka.length && !kb.length) return 1;
    const d = lev(ka, kb);
    return 1 - d / Math.max(ka.length, kb.length, 1);
  }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function nowIso() { return new Date().toISOString(); }
  function colLetter(c) { // 0-based -> A, B, ..., AA
    let s = '';
    c = c + 1;
    while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
    return s;
  }
  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtInt(n) { return (n || 0).toLocaleString('en-GB'); }
  function pct(part, total) { return total ? Math.round((part / total) * 100) : 0; }
  function groupBy(arr, fn) {
    const m = new Map();
    for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return m;
  }
  function count(arr, fn) {
    const m = {};
    for (const x of arr) { const k = fn(x); m[k] = (m[k] || 0) + 1; }
    return m;
  }
  function debounce(fn, ms) {
    let t = null;
    return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms); };
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  FG.util = { clean, key, has, lev, sim, uid, nowIso, colLetter, escapeHtml, fmtInt, pct, groupBy, count, debounce, deepClone };
})(typeof globalThis !== 'undefined' ? globalThis : window);
