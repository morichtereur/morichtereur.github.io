// Template-profile parser for capture workbooks (SheetJS workbook in, model out).
// Library-agnostic: takes an already-read SheetJS workbook object. Never addresses
// columns by letter – every column is found through titles, sub-headers and
// fuzzy field matching as described by the active profile.
import { GAP, WORKSHOP_STATUS, DETAILED_GAP_FIELDS } from '../model/constants.js';
import {
  normText, isEmpty, fuzzyKey, similarity, normalizeGap, parseYN, parseNumber,
  isOutOfScope, looksLikeInstruction, parseEntityLabel, streamOf, parentIdFromStructure,
  assessmentKey,
} from '../model/normalize.js';
import { PROFILE_CAPTURE_SHEET_V1 } from './profiles.js';

const PER_ENTITY_KINDS = ['ASIS', 'FITGAP', 'DETAILED'];
const FIT_GAP_KEYS = ['local', 'other', 'gbs', 'fte'];

export function colLetter(c) {
  let s = '';
  c = c + 1;
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
export function cellRef(r, c) { return `${colLetter(c)}${r + 1}`; }

const rx = (src, flags = 'i') => new RegExp(src, flags);

/* ------------------------------------------------------------------ sheets */

/** Classify the workbook's sheet names. */
export function classifySheets(sheetNames, profile = PROFILE_CAPTURE_SHEET_V1) {
  const inc = rx(profile.mainSheet.include), exc = rx(profile.mainSheet.exclude);
  const flows = rx(profile.mainSheet.flows);
  const out = { candidates: [], excludedOld: [], flows: [], ignored: [] };
  for (const name of sheetNames) {
    const t = normText(name);
    if (inc.test(t)) {
      if (exc.test(t)) out.excludedOld.push(name); else out.candidates.push(name);
    } else if (flows.test(t)) out.flows.push(name);
    else out.ignored.push(name);
  }
  return out;
}

/** Sheet → 2-D array of raw values (null for empty) + merge lookup. */
export function sheetToGrid(ws, XLSX) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  let width = 0;
  for (const r of rows) if (r.length > width) width = r.length;
  const merges = new Map();
  for (const m of ws['!merges'] || []) {
    merges.set(`${m.s.r},${m.s.c}`, { r0: m.s.r, c0: m.s.c, r1: m.e.r, c1: m.e.c });
  }
  return { rows, width, merges };
}

/* ------------------------------------------------------------------ layout */

function findHeaderRow(grid, profile) {
  const { anchor, searchColumns, searchRows } = profile.headerRow;
  const ak = fuzzyKey(anchor);
  for (let r = 0; r < Math.min(grid.rows.length, searchRows); r++) {
    const row = grid.rows[r];
    for (let c = 0; c < Math.min(row.length, searchColumns); c++) {
      if (fuzzyKey(row[c]) === ak) return { row: r, col: c };
    }
  }
  return null;
}

function matchScore(labelKey, synonyms) {
  let best = 0;
  for (const syn of synonyms) {
    const sk = fuzzyKey(syn);
    if (!sk) continue;
    let s = 0;
    if (labelKey === sk) s = 1;
    else if (labelKey.includes(sk)) s = 0.6 + 0.3 * (sk.length / labelKey.length);
    else if (sk.includes(labelKey) && labelKey.length >= 3) s = 0.5 + 0.3 * (labelKey.length / sk.length);
    else { const d = similarity(labelKey, sk); if (d >= 0.75) s = d * 0.9; }
    if (s > best) best = s;
  }
  return best;
}

/** Best field for a column label among a block's field dictionary. */
export function matchField(label, fields, threshold = 0.55) {
  const lk = fuzzyKey(label);
  if (!lk) return null;
  let best = null;
  for (const [field, synonyms] of Object.entries(fields)) {
    const s = matchScore(lk, synonyms);
    if (s >= threshold && (!best || s > best.score)) best = { field, score: s };
  }
  return best;
}

function findCoreColumns(grid, headerRow, profile) {
  const row = grid.rows[headerRow];
  const found = {};
  for (let c = 0; c < Math.min(row.length, profile.headerRow.searchColumns + 4); c++) {
    const m = matchField(row[c], profile.core, 0.8);
    if (m && (!found[m.field] || found[m.field].score < m.score)) found[m.field] = { col: c, score: m.score, header: normText(row[c]) };
  }
  return found;
}

/** Scan the band above the header for block titles, sub-headers and entity labels. */
function scanBand(grid, headerRow, profile, minCol = 0) {
  const top = Math.max(0, headerRow - profile.headerRow.bandAbove);
  const maxLen = profile.headerRow.maxTitleLength || 80;
  const titles = [], subHeaders = [], labels = [];
  const codeRx = rx(profile.entityLabel.codePattern);
  const legal = new Set(profile.entityLabel.legalForms.map(fuzzyKey));
  const titleRx = Object.entries(profile.blocks).map(([kind, b]) => [kind, b.titles.map(t => rx(t))]);
  const subRx = Object.entries(profile.blocks).filter(([, b]) => b.subHeaders).map(([kind, b]) => [kind, b.subHeaders.map(t => rx(t))]);

  for (let r = top; r <= headerRow; r++) {
    const row = grid.rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const text = normText(row[c]);
      if (!text || c < minCol || text.length > maxLen) continue;
      const merge = grid.merges.get(`${r},${c}`);
      const span = merge ? merge.c1 : c;
      let matched = false;
      if (r < headerRow) {
        for (const [kind, rxs] of titleRx) {
          if (rxs.some(x => x.test(text))) { titles.push({ kind, row: r, col: c, colEnd: span, text, merged: !!merge }); matched = true; break; }
        }
      }
      if (!matched && r < headerRow) {
        for (const [kind, rxs] of subRx) {
          if (rxs.some(x => x.test(text))) { subHeaders.push({ kind, row: r, col: c, colEnd: span, text }); matched = true; break; }
        }
      }
      if (matched || r === headerRow) continue;
      const m = codeRx.exec(text);
      const words = text.split(/\s+/).map(fuzzyKey);
      const hasLegal = words.some(w => legal.has(w));
      if (m || (hasLegal && text.length <= 80)) {
        const parsed = parseEntityLabel(text);
        if (parsed) labels.push({ row: r, col: c, colEnd: span, ...parsed });
      }
    }
  }
  return { titles, subHeaders, labels, top };
}

/** Build block instances (kind × entity) with column ranges. */
function buildBlocks(grid, headerRow, band, core, profile, warnings) {
  let titles = band.titles.slice();
  const hasAsIsTitle = titles.some(t => t.kind === 'ASIS');
  if (!hasAsIsTitle) {
    for (const s of band.subHeaders.filter(s => s.kind === 'ASIS')) {
      titles.push({ kind: 'ASIS', row: s.row, col: s.col, colEnd: null, text: s.text, merged: false, fromSubHeader: true });
    }
    if (band.subHeaders.length) warnings.push({ level: 'info', code: 'ASIS_FROM_SUBHEADER', message: `No "AS-IS PROCESS SPECIFICATION" title found – As-Is block(s) detected from the "${band.subHeaders[0].text}" sub-header.` });
  }
  titles.sort((a, b) => a.col - b.col || a.row - b.row);
  // Column end: merge span if known, else up to the next title start.
  const lastCol = Math.max(grid.width - 1, core.description ? core.description.col : 0);
  for (let i = 0; i < titles.length; i++) {
    const next = titles.slice(i + 1).find(t => t.col > titles[i].col);
    const toNext = next ? next.col - 1 : lastCol;
    if (titles[i].colEnd === null || titles[i].colEnd === titles[i].col || (titles[i].colEnd > toNext && !titles[i].merged)) titles[i].colEnd = toNext;
    if (next && titles[i].colEnd >= next.col) titles[i].colEnd = next.col - 1; // never overlap
  }
  // Entity labels sorted by column.
  const labels = band.labels.slice().sort((a, b) => a.col - b.col || a.row - b.row);
  const dedupLabels = (list) => { const seen = new Set(); return list.filter(l => { const k = l.code || fuzzyKey(l.name); if (seen.has(k)) return false; seen.add(k); return true; }); };

  const blocks = [];
  const ordinal = {};
  for (const t of titles) {
    const def = profile.blocks[t.kind];
    if (!def.perEntity) { blocks.push({ kind: t.kind, title: t.text, titleRow: t.row, col: t.col, colEnd: t.colEnd, entity: null }); continue; }
    // Labels that start inside the range, or whose merged span covers the range start.
    const inside = dedupLabels(labels.filter(l => l.col >= t.col && l.col <= t.colEnd));
    const covering = dedupLabels(labels.filter(l => l.col < t.col && l.colEnd >= t.col));
    if (inside.length >= 2) {
      for (let i = 0; i < inside.length; i++) {
        const start = i === 0 ? t.col : inside[i].col;
        const end = i + 1 < inside.length ? inside[i + 1].col - 1 : t.colEnd;
        blocks.push({ kind: t.kind, title: t.text, titleRow: t.row, col: start, colEnd: end, entity: inside[i], labelCell: cellRef(inside[i].row, inside[i].col) });
      }
    } else if (inside.length === 1 || covering.length >= 1) {
      const l = inside[0] || covering[covering.length - 1];
      blocks.push({ kind: t.kind, title: t.text, titleRow: t.row, col: t.col, colEnd: t.colEnd, entity: l, labelCell: cellRef(l.row, l.col) });
    } else {
      ordinal[t.kind] = (ordinal[t.kind] || 0) + 1;
      blocks.push({ kind: t.kind, title: t.text, titleRow: t.row, col: t.col, colEnd: t.colEnd, entity: null, ordinal: ordinal[t.kind] });
    }
  }
  // Blocks without a label: pair by ordinal with the labelled blocks of other kinds.
  const labelled = blocks.filter(b => b.entity).map(b => b.entity);
  const uniqueEntities = dedupLabels(labelled);
  for (const b of blocks.filter(b => profile.blocks[b.kind].perEntity && !b.entity)) {
    const guess = uniqueEntities[b.ordinal - 1];
    if (guess) {
      b.entity = guess; b.entityGuessed = true;
      warnings.push({ level: 'warn', code: 'ENTITY_BY_ORDINAL', message: `${b.kind} block at column ${colLetter(b.col)} has no entity label – assigned to "${guess.name}" by position (${b.ordinal}). Please verify.` });
    } else {
      b.entity = { code: null, name: `Unknown entity ${b.ordinal}`, raw: '' }; b.entityGuessed = true;
      warnings.push({ level: 'error', code: 'ENTITY_UNKNOWN', message: `${b.kind} block at column ${colLetter(b.col)} has no entity label and no other block to pair with.` });
    }
  }
  return blocks;
}

/** Map every column of a block to a field (or keep it as an extra column). */
function mapBlockFields(grid, headerRow, block, profile, warnings) {
  const def = profile.blocks[block.kind];
  const fields = {}; const extras = []; const taken = {};
  const skipTexts = new Set([fuzzyKey(block.title), block.entity ? fuzzyKey(block.entity.raw) : '']);
  for (let c = block.col; c <= block.colEnd; c++) {
    const parts = [];
    for (let r = Math.max(0, headerRow - 2); r <= headerRow; r++) {
      const v = normText((grid.rows[r] || [])[c]);
      if (v && !skipTexts.has(fuzzyKey(v))) parts.push(v);
    }
    if (!parts.length) continue;
    const header = normText((grid.rows[headerRow] || [])[c]);
    const candidates = [header, parts.join(' '), ...parts].filter(Boolean);
    let best = null;
    for (const cand of candidates) {
      const m = matchField(cand, def.fields);
      if (m && (!best || m.score > best.score)) best = { ...m, label: cand };
    }
    if (best && (!taken[best.field] || taken[best.field].score < best.score)) {
      if (taken[best.field]) extras.push({ col: taken[best.field].col, header: taken[best.field].header });
      taken[best.field] = { col: c, score: best.score, header: header || parts.join(' / ') };
      fields[best.field] = c;
    } else {
      extras.push({ col: c, header: header || parts.join(' / ') });
    }
  }
  const headers = {};
  for (const [f, t] of Object.entries(taken)) headers[f] = { col: t.col, cell: colLetter(t.col), header: t.header, score: Math.round(t.score * 100) / 100 };
  const missing = Object.keys(def.fields).filter(f => !(f in fields));
  if (missing.length && Object.keys(def.fields).length) {
    warnings.push({ level: block.kind === 'TOBE' ? 'info' : 'warn', code: 'FIELD_MISSING', message: `${block.kind}${block.entity ? ' (' + block.entity.name + ')' : ''}: no column found for ${missing.join(', ')}.` });
  }
  return { fields, headers, extras, missing };
}

/** Detect the complete layout of a main sheet. Pure – no data rows read yet. */
export function detectLayout(grid, profile = PROFILE_CAPTURE_SHEET_V1) {
  const warnings = [];
  const h = findHeaderRow(grid, profile);
  if (!h) return { ok: false, warnings: [{ level: 'error', code: 'NO_HEADER', message: `Header row not found (no "${profile.headerRow.anchor}" cell in the first ${profile.headerRow.searchRows} rows).` }] };
  const core = findCoreColumns(grid, h.row, profile);
  for (const k of ['level', 'id', 'name']) if (!core[k]) warnings.push({ level: 'error', code: 'CORE_MISSING', message: `Core column "${k}" not found in header row ${h.row + 1}.` });
  if (!core.level || !core.id) return { ok: false, headerRow: h.row, core, warnings };
  const lastCore = Math.max(...Object.values(core).map(x => x.col));
  const band = scanBand(grid, h.row, profile, lastCore + 1);
  const blocks = buildBlocks(grid, h.row, band, core, profile, warnings);
  for (const b of blocks) Object.assign(b, mapBlockFields(grid, h.row, b, profile, warnings));
  for (const k of PER_ENTITY_KINDS) if (!blocks.some(b => b.kind === k)) warnings.push({ level: k === 'ASIS' ? 'warn' : 'error', code: 'BLOCK_MISSING', message: `No ${k} block detected.` });
  const entities = [];
  for (const b of blocks) {
    if (!b.entity) continue;
    const key = b.entity.code || fuzzyKey(b.entity.name);
    let e = entities.find(x => (x.code || fuzzyKey(x.name)) === key);
    if (!e) { e = { code: b.entity.code, name: b.entity.name, raw: b.entity.raw, blocks: [] }; entities.push(e); }
    e.blocks.push(b.kind);
    if (!b.entity.code) warnings.push({ level: 'warn', code: 'ENTITY_NO_CODE', message: `Entity label "${b.entity.raw}" has no 6-digit code – matched by name only.` });
  }
  const seenCode = new Set();
  for (const e of entities) {
    if (e.code) seenCode.add(e.code);
    for (const k of PER_ENTITY_KINDS) if (!e.blocks.includes(k)) warnings.push({ level: 'warn', code: 'ENTITY_BLOCK_MISSING', message: `Entity "${e.name}" has no ${k} block.` });
  }
  return { ok: true, headerRow: h.row, core, band: { top: band.top, titles: band.titles, subHeaders: band.subHeaders, labels: band.labels }, blocks, entities, warnings };
}

/* --------------------------------------------------------------- data rows */

function readCell(grid, r, c) { return c === undefined || c === null ? null : (grid.rows[r] || [])[c] ?? null; }

function readTextFields(grid, r, block) {
  const out = {}; const cells = {};
  for (const [f, c] of Object.entries(block.fields)) { out[f] = normText(readCell(grid, r, c)); cells[f] = cellRef(r, c); }
  const extra = {};
  for (const x of block.extras) { const v = normText(readCell(grid, r, x.col)); if (v) extra[x.header] = v; }
  return { out, cells, extra };
}

/**
 * Parse one capture workbook.
 * @param wb SheetJS workbook
 * @param opts { XLSX, fileName, sheetName?, profile? }
 */
export function parseCaptureWorkbook(wb, opts) {
  const { XLSX, fileName = 'workbook.xlsx' } = opts;
  const profile = opts.profile || PROFILE_CAPTURE_SHEET_V1;
  const warnings = [];
  const sheets = classifySheets(wb.SheetNames, profile);
  let sheetName = opts.sheetName;
  if (!sheetName) {
    if (sheets.candidates.length === 0) return { ok: false, fileName, sheets, warnings: [{ level: 'error', code: 'NO_MAIN_SHEET', message: `No sheet starting with "Fit-Gap" in ${fileName}.` }] };
    if (sheets.candidates.length > 1) return { ok: false, needsSheetChoice: true, fileName, sheets, warnings: [{ level: 'warn', code: 'SHEET_CHOICE', message: `${sheets.candidates.length} candidate sheets in ${fileName}: ${sheets.candidates.join(' | ')}. Please pick one.` }] };
    sheetName = sheets.candidates[0];
  }
  if (sheets.excludedOld.length) warnings.push({ level: 'info', code: 'OLD_SHEETS_IGNORED', message: `Ignored old copies: ${sheets.excludedOld.join(', ')}.` });
  const grid = sheetToGrid(wb.Sheets[sheetName], XLSX);
  const layout = detectLayout(grid, profile);
  warnings.push(...layout.warnings);
  if (!layout.ok) return { ok: false, fileName, sheetName, sheets, layout, warnings };

  const idRx = rx(profile.dataRow.idPattern);
  const processes = []; const assessments = []; const skipped = []; const notes = [];
  const unmappedGap = []; const stack = {}; let hierarchyMismatch = 0;
  const toBe = layout.blocks.find(b => b.kind === 'TOBE');
  const perEntity = layout.blocks.filter(b => profile.blocks[b.kind].perEntity);
  const entityOf = (b) => b.entity.code || fuzzyKey(b.entity.name);
  const activityLevels = new Set(profile.dataRow.activityLevels);
  let skippedCount = 0;

  for (let r = layout.headerRow + 1; r < grid.rows.length; r++) {
    const rawLevel = readCell(grid, r, layout.core.level.col);
    const id = normText(readCell(grid, r, layout.core.id.col));
    const level = parseNumber(rawLevel);
    const valid = Number.isInteger(level) && level >= profile.dataRow.levelMin && level <= profile.dataRow.levelMax && idRx.test(id);
    if (!valid) {
      const name = normText(readCell(grid, r, layout.core.name?.col));
      if (!isEmpty(rawLevel) || id || name) { skippedCount++; if (skipped.length < 8) skipped.push({ row: r + 1, level: normText(rawLevel), id, name }); }
      continue;
    }
    const name = normText(readCell(grid, r, layout.core.name?.col));
    const description = normText(readCell(grid, r, layout.core.description?.col));
    stack[level] = id;
    for (const k of Object.keys(stack)) if (Number(k) > level) delete stack[k];
    let parentId = null;
    for (let l = level - 1; l >= 0; l--) if (stack[l]) { parentId = stack[l]; break; }
    const structural = parentIdFromStructure(id);
    if (level > 0 && structural && parentId && structural !== parentId && !(structural.length < parentId.length)) hierarchyMismatch++;
    const p = { id, level, name, description, stream: streamOf(id), parentId, structuralParentId: structural, row: r + 1 };
    if (toBe) {
      const { out, extra } = readTextFields(grid, r, toBe);
      p.toBe = { le: parseYN(out.le), gbs: parseYN(out.gbs), system: out.system || '', initiative: out.initiative || '', extra };
    }
    processes.push(p);
    if (!activityLevels.has(level)) continue;

    const byEntity = new Map();
    for (const b of perEntity) {
      const ek = entityOf(b);
      if (!byEntity.has(ek)) byEntity.set(ek, { entity: b.entity, blocks: {} });
      byEntity.get(ek).blocks[b.kind] = b;
    }
    for (const [, { entity, blocks }] of byEntity) {
      const code = entity.code || `name:${fuzzyKey(entity.name)}`;
      const a = {
        entityCode: code, processId: id, stream: p.stream,
        asIs: { le: null, gbs: null, systems: '', gap: null, gapRaw: '', info: '', extra: {} },
        fitGap: { local: null, other: null, gbs: null, fte: null, extra: {} },
        detailedGap: Object.fromEntries(DETAILED_GAP_FIELDS.map(f => [f, ''])),
        scope: { outOfScope: false, source: null, reason: '' },
        notes: [],
        workshop: { status: WORKSHOP_STATUS.NOT_ASSESSED, gapType: null, rationale: '', comment: '', nextStep: '', owner: '', due: '', changedAt: null },
        deviation: null,
        sources: [{ file: fileName, sheet: sheetName, row: r + 1, cells: {} }],
      };
      const src = a.sources[0];
      if (blocks.ASIS) {
        const { out, cells, extra } = readTextFields(grid, r, blocks.ASIS);
        const g = normalizeGap(out.gap);
        a.asIs = { le: parseYN(out.le), gbs: parseYN(out.gbs), systems: out.systems || '', gap: g.value, gapRaw: g.raw, info: out.info || '', extra };
        if (!g.mapped) unmappedGap.push({ row: r + 1, processId: id, entity: entity.name, raw: g.raw, cell: cells.gap });
        if (g.value === GAP.OUT_OF_SCOPE) { a.scope = { outOfScope: true, source: 'ops-gap', reason: '' }; }
        src.cells.asIs = cells;
      }
      for (const kind of ['FITGAP', 'DETAILED']) {
        const b = blocks[kind]; if (!b) continue;
        const { out, cells, extra } = readTextFields(grid, r, b);
        const target = kind === 'FITGAP' ? 'fitGap' : 'detailedGap';
        src.cells[target] = cells;
        for (const [f, v] of Object.entries(out)) {
          if (!v) continue;
          if (isOutOfScope(v)) { a.scope = { outOfScope: true, source: `${target}.${f}`, reason: '' }; continue; }
          if (looksLikeInstruction(v)) { a.notes.push({ kind: 'instruction', field: `${target}.${f}`, text: v, cell: cells[f] }); notes.push({ row: r + 1, processId: id, entity: entity.name, field: `${target}.${f}`, text: v }); continue; }
          if (kind === 'FITGAP') a.fitGap[f] = f === 'fte' ? parseNumber(v) : parseYN(v);
          else a.detailedGap[f] = v;
        }
        if (Object.keys(extra).length) (kind === 'FITGAP' ? a.fitGap : a.detailedGap).extra = extra;
      }
      if (a.scope.outOfScope) a.workshop.status = WORKSHOP_STATUS.OUT_OF_SCOPE;
      assessments.push(a);
    }
  }
  if (skippedCount) warnings.push({ level: 'info', code: 'ROWS_SKIPPED', message: `${skippedCount} non-data row(s) skipped (no numeric level 0–5 with a stream process ID).`, examples: skipped });
  if (hierarchyMismatch) warnings.push({ level: 'warn', code: 'HIERARCHY', message: `${hierarchyMismatch} row(s) where the parent by position differs from the parent implied by the Process ID.` });
  if (unmappedGap.length) warnings.push({ level: 'warn', code: 'GAP_UNMAPPED', message: `${unmappedGap.length} GAP value(s) could not be mapped (set to UNCLEAR).`, examples: unmappedGap.slice(0, 10) });
  if (notes.length) warnings.push({ level: 'info', code: 'INSTRUCTION_TEXT', message: `${notes.length} cell(s) with instruction text imported as notes, not values.`, examples: notes.slice(0, 10) });

  const entities = layout.entities.map(e => ({ code: e.code || `name:${fuzzyKey(e.name)}`, name: e.name, raw: e.raw, hasCode: !!e.code }));
  const activities = processes.filter(p => activityLevels.has(p.level));
  const summary = summarise(entities, activities, assessments);
  return {
    ok: true, fileName, sheetName, sheets, profileId: profile.id, layout,
    entities, processes, assessments, summary, warnings,
    flowSheets: sheets.flows,
  };
}

export function summarise(entities, activities, assessments) {
  const streams = {};
  for (const a of activities) { streams[a.stream] = streams[a.stream] || { activities: 0 }; streams[a.stream].activities++; }
  const perEntity = {};
  for (const a of assessments) {
    const e = perEntity[a.entityCode] = perEntity[a.entityCode] || { total: 0, outOfScope: 0, gap: {} };
    e.total++;
    if (a.scope.outOfScope) { e.outOfScope++; continue; }
    const g = a.asIs.gap || 'NOT_ASSESSED';
    e.gap[g] = (e.gap[g] || 0) + 1;
  }
  return { entities: entities.length, activities: activities.length, streams, perEntity };
}
