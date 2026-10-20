/* ---------------------------------------------------------------------------
 * 20-parser.js – capture-sheet parser, driven by a template profile.
 * Input: a SheetJS workbook. Output: detected structure + normalised model
 * fragments (entities, processes, assessments) + warnings/notes.
 * Nothing in here is column-letter based: header row, blocks, entities and
 * fields are all detected from cell text.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG || (root.FG = {});
  const U = FG.util;

  /* ---------- sheet selection ---------------------------------------- */
  function classifySheets(wb, profile) {
    const main = [], flows = [], ignored = [];
    for (const name of wb.SheetNames) {
      if (profile.sheets.mainPrefix.test(name)) {
        if (profile.sheets.ignoreSuffix.test(name)) ignored.push({ name, reason: 'old version' });
        else main.push(name);
      } else if (profile.sheets.flowPrefix.test(name)) flows.push(name);
      else ignored.push({ name, reason: 'not a capture or flow sheet' });
    }
    return { main, flows, ignored };
  }

  /* ---------- grid helpers --------------------------------------------- */
  function toGrid(ws) {
    const XLSX = root.XLSX;
    // Anchor the grid at A1 so row/column indices are absolute (sheet_to_json
    // otherwise starts at the first used cell, which breaks merge lookups when
    // column A is empty – as it is in the pilot files).
    const ref = ws && ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    const range = { s: { r: 0, c: 0 }, e: ref.e };
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true, range });
  }
  /** Fill merged ranges with their top-left value for rows <= maxRow. */
  function expandMerges(grid, ws, maxRow) {
    const merges = (ws && ws['!merges']) || [];
    const merged = new Map(); // "r,c" -> {r0,c0,r1,c1}
    for (const m of merges) {
      if (m.s.r > maxRow) continue;
      const v = (grid[m.s.r] || [])[m.s.c];
      for (let r = m.s.r; r <= Math.min(m.e.r, maxRow); r++) {
        if (!grid[r]) grid[r] = [];
        for (let c = m.s.c; c <= m.e.c; c++) {
          if (r !== m.s.r || c !== m.s.c) grid[r][c] = v;
          merged.set(r + ',' + c, { r0: m.s.r, c0: m.s.c, r1: m.e.r, c1: m.e.c });
        }
      }
    }
    return merged;
  }
  function cell(grid, r, c) { const row = grid[r]; return row ? row[c] : null; }
  function text(grid, r, c) { return U.clean(cell(grid, r, c)); }

  /* ---------- header row ------------------------------------------------ */
  function findHeader(grid, profile) {
    const want = U.key(profile.header.levelHeader);
    const scan = Math.min(grid.length, profile.header.scanRows);
    // preferred column first
    for (let r = 0; r < scan; r++) if (U.key(cell(grid, r, profile.header.preferredCol)) === want) return { row: r, col: profile.header.preferredCol };
    for (let r = 0; r < scan; r++) {
      const row = grid[r] || [];
      for (let c = 0; c < row.length; c++) if (U.key(row[c]) === want) return { row: r, col: c };
    }
    return null;
  }
  function findIdColumns(grid, hr, baseCol, profile) {
    const spec = profile.header.idColumns;
    const out = { level: baseCol };
    const maxC = baseCol + 8;
    const pick = (syns, fallback) => {
      let best = null, bestScore = 0;
      for (let c = baseCol + 1; c <= maxC; c++) {
        const t = text(grid, hr, c); if (!t) continue;
        for (const s of syns) {
          const sc = U.key(t) === U.key(s) ? 1 : U.sim(t, s);
          if (sc > bestScore) { bestScore = sc; best = c; }
        }
      }
      return bestScore >= 0.85 ? best : fallback;
    };
    out.id = pick(spec.id, baseCol + 1);
    out.name = pick(spec.name.filter(s => U.key(s) !== 'activity'), baseCol + 2);
    out.description = pick(spec.description, baseCol + 3);
    if (out.name === out.id) out.name = baseCol + 2;
    if (out.description === out.name || out.description === out.id) out.description = baseCol + 3;
    return out;
  }

  /* ---------- block + entity detection ---------------------------------- */
  function matchBlockTitle(t, profile) {
    let best = null, bestScore = 0;
    for (const b of profile.blocks) {
      for (const title of b.titles) {
        let sc = 0;
        if (U.key(t) === U.key(title)) sc = 1;
        else if (U.has(t, title)) sc = 0.95;
        else sc = U.sim(t, title);
        if (sc > bestScore) { bestScore = sc; best = b; }
      }
    }
    return bestScore >= 0.8 ? { block: best, score: bestScore } : null;
  }
  function parseEntityLabel(raw, profile) {
    const t = U.clean(raw);
    const m = t.match(profile.entity.pattern);
    if (m) return { code: m[1], name: U.clean(m[2].replace(profile.entity.stripParens, ' ')) || m[1], raw: t, needsConfirmation: false };
    return { code: null, name: U.clean(t.replace(profile.entity.stripParens, ' ')), raw: t, needsConfirmation: true };
  }
  function allSynonyms(profile) {
    const set = new Set();
    for (const b of profile.blocks) {
      for (const m of (b.markers || [])) set.add(U.key(m));
      for (const k in (b.fields || {})) for (const s of b.fields[k]) set.add(U.key(s));
    }
    return set;
  }

  function detectLayout(grid, merged, hr, baseCol, idCols, profile, warnings) {
    const firstDataCol = Math.max(idCols.id, idCols.name, idCols.description) + 1;
    const titleRows = [];
    for (let r = Math.max(0, hr - profile.header.titleRows); r <= hr; r++) titleRows.push(r);
    const lastCol = Math.max.apply(null, titleRows.concat([hr + 1, hr + 2, hr + 3]).map(r => (grid[r] || []).length)) - 1;

    const synonyms = allSynonyms(profile);
    const titles = [], entityCells = [], other = [];
    const seen = new Set();
    for (const r of titleRows) {
      for (let c = firstDataCol; c <= lastCol; c++) {
        const t = text(grid, r, c); if (!t) continue;
        const m = merged.get(r + ',' + c);
        const id = m ? (m.r0 + ',' + m.c0) : (r + ',' + c);
        if (seen.has(id)) continue; seen.add(id);
        const cEnd = m ? m.c1 : c;
        const bm = matchBlockTitle(t, profile);
        if (bm) { titles.push({ block: bm.block, text: t, r, c, cEnd, merged: !!m }); continue; }
        if (r === hr) continue; // header row holds sub-headers only
        if (profile.entity.pattern.test(t)) { entityCells.push({ ...parseEntityLabel(t, profile), r, c, cEnd }); continue; }
        if (synonyms.has(U.key(t)) || profile.entity.ignore.test(t)) continue;
        other.push({ text: t, r, c, cEnd });
      }
    }
    titles.sort((a, b) => a.c - b.c || a.r - b.r);
    // un-merged titles extend to the next title (any row) – 1
    for (let i = 0; i < titles.length; i++) {
      if (titles[i].merged) continue;
      const next = titles.slice(i + 1).find(x => x.c > titles[i].c);
      titles[i].cEnd = next ? next.c - 1 : lastCol;
    }
    // entities: coded labels win; otherwise fall back to free text in title rows
    let entities = entityCells;
    if (!entities.length && other.length) {
      const cand = other.filter(o => o.r < hr && U.clean(o.text).length >= 3 && !/\(y\/n\)/i.test(o.text));
      entities = cand.map(o => ({ ...parseEntityLabel(o.text, profile), r: o.r, c: o.c, cEnd: o.cEnd }));
      if (entities.length) warnings.push({ level: 'warn', code: 'ENTITY_NO_CODE', msg: 'No 6-digit entity codes found in the title rows; using free text labels: ' + entities.map(e => '"' + e.raw + '"').join(', ') + '. Please confirm the entity mapping.' });
    } else if (other.length) {
      warnings.push({ level: 'info', code: 'TITLE_TEXT_IGNORED', msg: 'Unrecognised text in title rows ignored: ' + other.slice(0, 8).map(o => '"' + o.text + '" (' + U.colLetter(o.c) + (o.r + 1) + ')').join(', ') + (other.length > 8 ? ' …' : '') });
    }
    entities.sort((a, b) => a.c - b.c);
    const entityAt = (c) => { let e = null; for (const x of entities) { if (x.c <= c) e = x; else break; } return e; };

    // sub-header texts per column: 2 rows above header + header row
    const subRows = [hr - 2, hr - 1, hr].filter(r => r >= 0);
    const subTexts = (c) => {
      const out = [];
      for (const r of subRows) {
        const t = text(grid, r, c); if (!t) continue;
        if (titles.some(x => x.r === r && x.text === t)) continue;
        if (entities.some(x => x.r === r && x.raw === t)) continue;
        if (!out.includes(t)) out.push(t);
      }
      return out;
    };

    // assign each data column to a block
    const cols = [];
    for (let c = firstDataCol; c <= lastCol; c++) {
      const title = titles.find(x => c >= x.c && c <= x.cEnd) || null;
      cols.push({ c, title, subs: subTexts(c), block: title ? title.block : null, titleRef: title });
    }
    // untitled runs: marker rule, then "continue previous perEntity block if a field matches"
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      if (col.block) continue;
      if (!col.subs.length) continue;
      const joined = col.subs.join(' ');
      let found = null;
      for (const b of profile.blocks) for (const m of (b.markers || [])) if (U.has(joined, m)) { found = b; break; }
      if (!found) {
        // look back: previous untitled columns in this run share the marker
        for (let j = i - 1; j >= 0 && !cols[j].titleRef; j--) if (cols[j].block && cols[j].inferred) { found = cols[j].block; break; }
      }
      if (found) { col.block = found; col.inferred = true; }
    }

    // field mapping per block instance (block × entity)
    const instances = new Map(); // key -> instance
    const instKey = (block, ent) => block.key + '|' + (block.perEntity ? (ent ? (ent.code || 'name:' + U.key(ent.name)) : '?') : '');
    for (const col of cols) {
      if (!col.block) {
        if (col.subs.length) col.unassigned = true;
        continue;
      }
      const b = col.block;
      const ent = b.perEntity ? entityAt(col.c) : null;
      const k = instKey(b, ent);
      if (!instances.has(k)) instances.set(k, { key: b.key, label: b.label, perEntity: b.perEntity, title: col.titleRef ? col.titleRef.text : (b.markers ? b.markers[0] + ' (untitled, detected by sub-header)' : ''), entity: ent ? { code: ent.code, name: ent.name, raw: ent.raw, needsConfirmation: ent.needsConfirmation } : null, colStart: col.c, colEnd: col.c, fields: {}, unmapped: [] });
      const inst = instances.get(k);
      inst.colEnd = col.c;
      if (!col.subs.length) continue;
      if (b.free) {
        const name = col.subs.join(' · ');
        inst.fields[name] = { col: col.c, header: name };
        continue;
      }
      // score fields
      let best = null, bestScore = 0, second = 0;
      const joined = col.subs.join(' ');
      for (const f in b.fields) {
        let sc = 0;
        for (const syn of b.fields[f]) {
          for (const t of col.subs.concat([joined])) {
            let s = 0;
            if (U.key(t) === U.key(syn)) s = 1;
            else if (U.key(syn).length >= 3 && U.has(t, syn)) s = 0.86 + Math.min(U.key(syn).length, 14) / 100; // longer synonyms win
            else { const si = U.sim(t, syn); if (si >= 0.8) s = si * 0.9; }
            if (s > sc) sc = s;
          }
        }
        if (sc > bestScore) { second = bestScore; bestScore = sc; best = f; }
        else if (sc > second) second = sc;
      }
      if (best && bestScore >= 0.75) {
        if (inst.fields[best]) {
          warnings.push({ level: 'warn', code: 'FIELD_DUPLICATE', msg: `Field "${best}" of block "${b.label}"${ent ? ' (' + ent.raw + ')' : ''} found twice (columns ${U.colLetter(inst.fields[best].col)} and ${U.colLetter(col.c)}); keeping the first.` });
          inst.unmapped.push({ col: col.c, header: joined, reason: 'duplicate' });
        } else {
          inst.fields[best] = { col: col.c, header: joined, score: Math.round(bestScore * 100) / 100 };
          if (bestScore < 0.9 && second >= bestScore - 0.05) warnings.push({ level: 'info', code: 'FIELD_AMBIGUOUS', msg: `Column ${U.colLetter(col.c)} "${joined}" mapped to "${best}" in block "${b.label}" with low confidence.` });
        }
      } else {
        inst.unmapped.push({ col: col.c, header: joined });
      }
    }
    const blocks = Array.from(instances.values()).sort((a, b) => a.colStart - b.colStart);
    const unassigned = cols.filter(c => c.unassigned).map(c => ({ col: c.c, letter: U.colLetter(c.c), header: c.subs.join(' · ') }));
    if (unassigned.length) warnings.push({ level: 'info', code: 'COLUMNS_UNASSIGNED', msg: `${unassigned.length} column(s) with headers but no block: ` + unassigned.slice(0, 6).map(u => u.letter + ' "' + u.header + '"').join(', ') + (unassigned.length > 6 ? ' …' : '') });

    // sanity warnings
    for (const b of profile.blocks) {
      if (b.free) continue;
      const inst = blocks.filter(x => x.key === b.key);
      if (!inst.length) { warnings.push({ level: b.key === 'toBe' ? 'info' : 'warn', code: 'BLOCK_MISSING', msg: `Block "${b.label}" not found.` }); continue; }
      for (const x of inst) {
        const missing = Object.keys(b.fields).filter(f => !x.fields[f]);
        if (missing.length) warnings.push({ level: missing.includes('gap') || missing.includes('local') ? 'warn' : 'info', code: 'FIELD_MISSING', msg: `Block "${b.label}"${x.entity ? ' (' + x.entity.raw + ')' : ''}: field(s) not found: ${missing.join(', ')}.` });
        if (b.perEntity && !x.entity) warnings.push({ level: 'warn', code: 'ENTITY_MISSING', msg: `Block "${b.label}" at columns ${U.colLetter(x.colStart)}–${U.colLetter(x.colEnd)} has no entity label above it.` });
      }
    }
    const entityList = [];
    const seenE = new Set();
    for (const e of entities) { const k = e.code || 'name:' + U.key(e.name); if (seenE.has(k)) continue; seenE.add(k); entityList.push({ code: e.code, name: e.name, raw: e.raw, needsConfirmation: e.needsConfirmation, key: k }); }
    return { blocks, entities: entityList, unassigned, firstDataCol, lastCol };
  }

  /* ---------- value normalisation ---------------------------------------- */
  function normYN(v, profile, report) {
    const t = U.clean(v);
    if (!t) return null;
    if (profile.values.yes.test(t)) return 'Y';
    if (profile.values.no.test(t)) return 'N';
    if (profile.values.na.test(t)) return 'NA';
    report.yn[t] = (report.yn[t] || 0) + 1;
    return t;
  }
  function normGap(v, profile, report) {
    const t = U.clean(v);
    if (!t) return null;
    const k = U.key(t) || t; // "?" has no alnum
    for (const g of profile.values.gap) if (g.test.test(k) || g.test.test(t)) return g.code;
    report.gap[t] = (report.gap[t] || 0) + 1;
    return 'UNCLEAR';
  }
  function normText(v) { const t = U.clean(v); return t ? t : null; }
  function normNum(v, report) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    const t = U.clean(v).replace(',', '.');
    const n = parseFloat(t);
    if (!isNaN(n) && /^-?\d*\.?\d+$/.test(t)) return n;
    report.num[t] = (report.num[t] || 0) + 1;
    return null;
  }
  function isInstruction(t, profile) { return profile.values.instruction.some(p => p.test(t)); }

  /* ---------- main --------------------------------------------------------- */
  /**
   * parseWorkbook(wb, { fileName, profile, sheetName })
   * Returns { ok, needsPick:[...] } or the parsed result.
   */
  function parseWorkbook(wb, opts) {
    const profile = (opts && opts.profile) || FG.defaultProfile;
    const fileName = (opts && opts.fileName) || 'workbook.xlsx';
    const warnings = [], notes = [];
    const sheets = classifySheets(wb, profile);
    let sheetName = opts && opts.sheetName;
    if (!sheetName) {
      if (sheets.main.length === 0) return { ok: false, error: 'No sheet whose name starts with "Fit-Gap" found. Sheets: ' + wb.SheetNames.join(', '), fileName };
      if (sheets.main.length > 1) return { ok: false, needsPick: sheets.main, fileName };
      sheetName = sheets.main[0];
    }
    const ws = wb.Sheets[sheetName];
    const grid = toGrid(ws);
    const hdr = findHeader(grid, profile);
    if (!hdr) return { ok: false, error: `Header row not found in sheet "${sheetName}" (no cell "${profile.header.levelHeader}" within the first ${profile.header.scanRows} rows).`, fileName };
    const hr = hdr.row, baseCol = hdr.col;
    const merged = expandMerges(grid, ws, hr);
    const idCols = findIdColumns(grid, hr, baseCol, profile);
    const layout = detectLayout(grid, merged, hr, baseCol, idCols, profile, warnings);

    const report = { gap: {}, yn: {}, num: {} };
    const processes = [], assessments = [], seenIds = new Map();
    const stack = [];
    let skipped = 0, skippedWithText = [], dupes = 0, presetCells = 0, oosCells = 0;
    const byLevel = {};
    const streamsSeen = new Set();

    const perEntity = layout.blocks.filter(b => b.perEntity);
    const shared = layout.blocks.filter(b => !b.perEntity);
    const toBeBlock = shared.find(b => b.key === 'toBe');

    for (let r = hr + 1; r < grid.length; r++) {
      const row = grid[r]; if (!row) continue;
      const lvRaw = row[idCols.level];
      const idRaw = U.clean(row[idCols.id]);
      const lv = lvRaw === null || lvRaw === undefined || U.clean(lvRaw) === '' ? NaN : Number(U.clean(lvRaw));
      const okLevel = Number.isInteger(lv) && lv >= 0 && lv <= profile.rows.maxLevel;
      const okId = profile.rows.idPattern.test(idRaw);
      if (!okLevel || !okId) {
        const anyText = idRaw || U.clean(row[idCols.name]) || U.clean(row[idCols.level]);
        if (anyText) { skipped++; if (skippedWithText.length < 5) skippedWithText.push(`row ${r + 1}: "${anyText.slice(0, 40)}"`); }
        continue;
      }
      const id = idRaw.replace(/\s+/g, ' ');
      if (seenIds.has(id)) { dupes++; continue; }
      seenIds.set(id, r);
      const streamM = id.match(profile.streams.fromId);
      const stream = streamM ? streamM[1].toUpperCase() : 'OTHER';
      streamsSeen.add(stream);
      // hierarchy
      stack.length = lv; // drop deeper
      let parentId = null;
      for (let l = lv - 1; l >= 0; l--) if (stack[l]) { parentId = stack[l]; break; }
      stack[lv] = id;
      const name = normText(row[idCols.name]) || '';
      const description = normText(row[idCols.description]);
      const proc = { id, level: lv, name, description, stream, subStream: null, parentId, isActivity: lv >= profile.rows.activityLevel, toBe: null, context: {}, sources: [fileName], notes: [] };
      byLevel[lv] = (byLevel[lv] || 0) + 1;
      if (toBeBlock) {
        proc.toBe = {};
        for (const f in toBeBlock.fields) {
          const v = row[toBeBlock.fields[f].col];
          proc.toBe[f] = (f === 'le' || f === 'gbs') ? normYN(v, profile, report) : normText(v);
        }
      }
      for (const b of shared) {
        if (b.key === 'toBe') continue;
        const ctx = {};
        for (const f in b.fields) { const v = normText(row[b.fields[f].col]); if (v !== null) ctx[f] = v; }
        if (Object.keys(ctx).length) proc.context[b.key] = ctx;
      }
      processes.push(proc);
      if (!proc.isActivity) continue;

      // per-entity assessments
      const byEnt = new Map();
      for (const b of perEntity) {
        const ek = b.entity ? (b.entity.code || 'name:' + U.key(b.entity.name)) : '?';
        if (!byEnt.has(ek)) byEnt.set(ek, { entityKey: ek, entityCode: b.entity ? b.entity.code : null, entityName: b.entity ? b.entity.name : null, processId: id, asIs: {}, fitGap: {}, detailedGap: {}, status: null, statusReason: null, preset: {}, sources: [fileName] });
        const a = byEnt.get(ek);
        for (const f in b.fields) {
          const v = row[b.fields[f].col];
          const t = U.clean(v);
          if (b.key === 'asIs') {
            if (f === 'gap') a.asIs.gapRaw = t || null, a.asIs.gap = normGap(v, profile, report);
            else if (f === 'le' || f === 'gbs') a.asIs[f] = normYN(v, profile, report);
            else a.asIs[f] = normText(v);
            continue;
          }
          if (!t) continue;
          if (profile.values.outOfScope.test(t)) { a.status = 'OUT_OF_SCOPE'; a.statusReason = 'Pre-set in file (' + b.label + ' / ' + f + ')'; oosCells++; continue; }
          if (isInstruction(t, profile)) {
            notes.push({ processId: id, entityKey: ek, entityName: a.entityName, block: b.key, field: f, text: t, cell: U.colLetter(b.fields[f].col) + (r + 1) });
            continue;
          }
          presetCells++;
          if (b.key === 'fitGap') a.fitGap[f] = (f === 'fte') ? normNum(v, report) : normYN(v, profile, report);
          else a.detailedGap[f] = normText(v);
          a.preset[b.key + '.' + f] = true;
        }
      }
      for (const a of byEnt.values()) {
        if (a.status === 'OUT_OF_SCOPE' && a.asIs.gap === null) a.asIs.gap = 'OUT_OF_SCOPE';
        if (a.asIs.gap === 'OUT_OF_SCOPE' && a.status !== 'OUT_OF_SCOPE') { a.status = 'OUT_OF_SCOPE'; a.statusReason = 'Ops GAP = Out of scope'; }
        assessments.push(a);
      }
    }
    // sub-streams (A2R FAA / IA): inherit from the nearest ancestor whose name matches
    const byId = new Map(processes.map(p => [p.id, p]));
    const subDefs = profile.streams.subStreams;
    for (const p of processes) {
      const defs = subDefs[p.stream]; if (!defs) continue;
      let cur = p, found = null;
      while (cur && !found) { for (const d of defs) if (d.match.test(cur.name)) { found = d.key; break; } cur = cur.parentId ? byId.get(cur.parentId) : null; }
      p.subStream = found;
    }
    for (const p of processes) p.isMasterData = profile.streams.masterData.test(p.name) || (p.parentId && byId.get(p.parentId) && byId.get(p.parentId).isMasterData) || false;

    if (skipped) warnings.push({ level: 'info', code: 'ROWS_SKIPPED', msg: `${skipped} row(s) with text but no valid level/ID skipped (e.g. ${skippedWithText.join('; ')}).` });
    if (dupes) warnings.push({ level: 'warn', code: 'DUPLICATE_IDS', msg: `${dupes} duplicate Process ID row(s) ignored (first occurrence kept).` });
    if (notes.length) warnings.push({ level: 'warn', code: 'INSTRUCTION_TEXT', msg: `${notes.length} cell(s) in Fit-Gap/Detailed Gap contain instruction text, imported as notes (not values).` });
    if (presetCells) warnings.push({ level: 'info', code: 'PRESET_VALUES', msg: `${presetCells} Fit-Gap/Detailed Gap cell(s) were already filled in the file; imported as pre-set values (workshop can overwrite).` });
    const unmappedGap = Object.keys(report.gap).length;
    if (unmappedGap) warnings.push({ level: 'warn', code: 'GAP_UNMAPPED', msg: `${unmappedGap} GAP value(s) could not be mapped: ` + Object.entries(report.gap).map(([k, n]) => `"${k}" ×${n}`).join(', ') });
    const unmappedYN = Object.keys(report.yn).length;
    if (unmappedYN) warnings.push({ level: 'info', code: 'YN_UNMAPPED', msg: `${unmappedYN} Y/N value(s) not recognised: ` + Object.entries(report.yn).slice(0, 10).map(([k, n]) => `"${k}" ×${n}`).join(', ') });
    if (!processes.length) warnings.push({ level: 'error', code: 'NO_ROWS', msg: 'No data rows found below the header.' });

    const activities = processes.filter(p => p.isActivity);
    const gapDist = {};
    for (const a of assessments) { const g = a.asIs.gap || 'EMPTY'; gapDist[g] = (gapDist[g] || 0) + 1; }
    return {
      ok: true, fileName, sheetName, profileId: profile.id,
      structure: { headerRow: hr + 1, baseCol: U.colLetter(baseCol), idCols: { level: U.colLetter(idCols.level), id: U.colLetter(idCols.id), name: U.colLetter(idCols.name), description: U.colLetter(idCols.description) }, blocks: layout.blocks.map(b => ({ ...b, colStartLetter: U.colLetter(b.colStart), colEndLetter: U.colLetter(b.colEnd), fields: Object.fromEntries(Object.entries(b.fields).map(([k, v]) => [k, { ...v, letter: U.colLetter(v.col) }])) })), entities: layout.entities, unassigned: layout.unassigned, sheets },
      entities: layout.entities, processes, assessments, notes, warnings,
      unmapped: report,
      stats: { rows: grid.length - hr - 1, nodes: processes.length - activities.length, activities: activities.length, byLevel, streams: Array.from(streamsSeen), entities: layout.entities.length, assessments: assessments.length, outOfScope: assessments.filter(a => a.status === 'OUT_OF_SCOPE').length, gapDist, flowSheets: sheets.flows.length, presetCells, oosCells },
    };
  }

  FG.parser = { parseWorkbook, classifySheets, parseEntityLabel, normGap, normYN, findHeader, expandMerges };
})(typeof globalThis !== 'undefined' ? globalThis : window);
