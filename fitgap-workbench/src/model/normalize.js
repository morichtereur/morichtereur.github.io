// Value normalisation and fuzzy helpers. Pure functions, no DOM, no library.
import { GAP } from './constants.js';

/** Collapse whitespace, treat NBSP as space, trim. Returns '' for empty/null. */
export function normText(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

export function isEmpty(v) {
  return normText(v) === '';
}

/** Lowercase alphanumerics only – the key used for all fuzzy header matching. */
export function fuzzyKey(v) {
  return normText(v).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Sørensen–Dice similarity on character bigrams, 0..1. */
export function similarity(a, b) {
  const ka = fuzzyKey(a), kb = fuzzyKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  if (ka.length < 2 || kb.length < 2) return 0;
  const grams = new Map();
  for (let i = 0; i < ka.length - 1; i++) {
    const g = ka.slice(i, i + 2);
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < kb.length - 1; i++) {
    const g = kb.slice(i, i + 2);
    const n = grams.get(g) || 0;
    if (n > 0) { hits++; grams.set(g, n - 1); }
  }
  return (2 * hits) / (ka.length - 1 + kb.length - 1);
}

const GAP_SYNONYMS = [
  [GAP.OUT_OF_SCOPE, ['outofscope', 'oos', 'notinscope']],
  [GAP.BOTH, ['both', 'bothgaps', 'bothgap', 'harmonizationstandardization', 'harmonisationstandardisation', 'hs']],
  [GAP.NO_GAP, ['nogap', 'no', 'none', 'fit', 'nogaps', 'nodeviation', 'ok']],
  [GAP.HARMONIZATION, ['harmonization', 'harmonisation', 'harminization', 'harmonizationgap', 'harmonisationgap', 'harm', 'h']],
  [GAP.STANDARDIZATION, ['standardization', 'standardisation', 'standardizationgap', 'standardisationgap', 'std', 's']],
  [GAP.NA, ['na', 'notapplicable', 'nap', 'n']],
  [GAP.UNCLEAR, ['', 'tbd', 'tbc', 'unclear', 'open', 'unknown']],
];

/**
 * Map a raw GAP cell to a canonical value.
 * Returns { value, mapped, raw }. mapped=false means the raw text was not
 * recognised (value then UNCLEAR) – collected into the unmapped-values report.
 * Empty cells are returned as value=null (not assessed by Ops), mapped=true.
 */
export function normalizeGap(raw) {
  const text = normText(raw);
  if (text === '') return { value: null, mapped: true, raw: '' };
  if (text === '?' || text === '??') return { value: GAP.UNCLEAR, mapped: true, raw: text };
  const key = fuzzyKey(text);
  for (const [value, keys] of GAP_SYNONYMS) {
    if (keys.includes(key)) return { value, mapped: true, raw: text };
  }
  // Tolerant containment: "BOTH GAPs (see comment)" etc.
  if (key.includes('outofscope')) return { value: GAP.OUT_OF_SCOPE, mapped: true, raw: text };
  if (key.includes('both')) return { value: GAP.BOTH, mapped: true, raw: text };
  const hasH = /harm[oi]ni[sz]/.test(key);
  const hasS = /standardi[sz]/.test(key);
  if (hasH && hasS) return { value: GAP.BOTH, mapped: true, raw: text };
  if (hasH) return { value: GAP.HARMONIZATION, mapped: true, raw: text };
  if (hasS) return { value: GAP.STANDARDIZATION, mapped: true, raw: text };
  if (key.startsWith('nogap')) return { value: GAP.NO_GAP, mapped: true, raw: text };
  // Fuzzy last resort for typos we have not seen yet.
  let best = { value: GAP.UNCLEAR, score: 0 };
  for (const [value, keys] of GAP_SYNONYMS) {
    for (const k of keys) {
      if (k.length < 4) continue;
      const s = similarity(key, k);
      if (s > best.score) best = { value, score: s };
    }
  }
  if (best.score >= 0.8) return { value: best.value, mapped: true, raw: text, fuzzy: true };
  return { value: GAP.UNCLEAR, mapped: false, raw: text };
}

/** Y/N cells → true | false | null (empty). Unrecognised text → { text }. */
export function parseYN(raw) {
  const t = normText(raw);
  if (t === '') return null;
  const k = t.toLowerCase();
  if (['y', 'yes', 'x', 'true', '1', 'ja', 'oui'].includes(k)) return true;
  if (['n', 'no', 'false', '0', 'nein', 'non', '-'].includes(k)) return false;
  return { text: t };
}

/** FTE / numeric cells; accepts "0,5" and "0.5". */
export function parseNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const t = normText(raw).replace(/\s/g, '');
  if (t === '') return null;
  const n = Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function isOutOfScope(raw) {
  const k = fuzzyKey(raw);
  return k === 'outofscope' || k === 'oos' || k === 'notinscope';
}

/**
 * Heuristic for instruction text left in capture cells ("to be copied into …").
 * Deliberately conservative: long text with a verb phrase typical for guidance.
 */
export function looksLikeInstruction(raw) {
  const t = normText(raw);
  if (t.length < 25) return false;
  return /\b(to be (copied|filled|completed|entered|provided|added)|please (fill|enter|complete|add|copy|provide)|copy (this|into)|fill in|see (tab|sheet|column)|will be (filled|copied|provided))\b/i.test(t);
}

/**
 * Entity label → { code, name, raw } or null. Code = first 6-digit token.
 * Suffixes in parentheses are stripped from the name.
 */
export function parseEntityLabel(raw) {
  const t = normText(raw);
  if (!t) return null;
  const m = t.match(/(?:^|[^\d])(\d{6})(?!\d)/);
  const code = m ? m[1] : null;
  let name = t;
  if (code) name = name.replace(m[0], m[0].replace(code, '')).trim();
  name = name.replace(/\s*\([^)]*\)\s*/g, ' ');
  // Trailing remarks after a dash ("Entity XY S.A.S. - out of scope") are notes, not part of the name.
  let outOfScope = false; const dash = name.match(/^(.*?\S)\s+[-–—]\s+(.+)$/);
  if (dash) { if (/out of scope|not in scope/i.test(dash[2])) outOfScope = true; name = dash[1]; }
  name = name.replace(/^[\s\-–:|]+|[\s\-–:|]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!code && !name) return null;
  return { code, name: name || (code ? `Entity ${code}` : ''), raw: t, outOfScope };
}

/** Stream prefix of a process ID ("R2R 2.1.1" → "R2R"). */
export function streamOf(processId) {
  const m = normText(processId).match(/^([A-Z0-9]{3,4})\b/i);
  return m ? m[1].toUpperCase() : null;
}

/** Parent ID derived from the ID structure ("R2R 2.1.1" → "R2R 2.1", "R2R 2" → "R2R"). */
export function parentIdFromStructure(processId) {
  const t = normText(processId);
  const m = t.match(/^([A-Z0-9]+)\s+([\d.]+)$/i);
  if (!m) return null;
  const parts = m[2].split('.').filter(Boolean);
  if (parts.length <= 1) return m[1];
  return `${m[1]} ${parts.slice(0, -1).join('.')}`;
}

/** Stable key for an assessment: entity × process. */
export function assessmentKey(entityCode, processId) {
  return `${entityCode}::${normText(processId)}`;
}
