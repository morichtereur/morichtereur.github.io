# Data model – proposal for sign-off (increment 1)

Status: **implemented as proposed below, awaiting your OK.** Everything is a plain JSON object (one `Session`), so IndexedDB autosave, the JSON file and the later Replit/SQLite port use the same shape. Field names below are the ones in `src/js/30-model.js` and `src/js/20-parser.js`.

## Session (one per country transition)

```
Session {
  kind: 'fitgap-workbench-session', version: 1, id, createdAt, updatedAt,
  profileId: 'profile-1',
  settings: { clientName, country, workshopDates, facilitators, logoDataUrl, editorInitials,
              theme, screenShare, streamScope: { [streamKey]: bool }, gapDefinitions: { [gapType]: text } },
  files:        [ FileImport ],            // one entry per file (latest version)
  entities:     { [entityKey]: Entity },
  processes:    { [processId]: Process },
  assessments:  { [entityKey + '|' + processId]: Assessment },
  participants: [ Participant ],           // increment 2
  sessions:     [ WorkshopSession ],       // increment 2
  activeSessionId,
  pendingDiffs: [ Diff ],                  // re-import changes awaiting review
  audit:        [ AuditEntry ],
  feedback:     [ { id, ts, view, note, session } ],
  taxonomyRequests: [ ]                    // increment 2
}
```

### Entity
```
Entity { key, code, name, displayName, country, sources: [fileName], needsConfirmation }
```
`key` = 6-digit code, or `name:<normalised name>` when the file has no code (then `needsConfirmation` = true and the display name is editable in the import summary). Entities are merged across files by key.

### Process (hierarchy node or activity)
```
Process { id, level (0–5), name, description, stream ('R2R'…), subStream ('A2R-FAA' | 'A2R-IA' | null),
          parentId, isActivity (level >= 4), isMasterData,
          toBe: { le, gbs, system, initiative },      // shared block, Y/N normalised
          context: { processSpec: {...}, automation: {...}, changeImpact: {...}, raci: {...} },  // shared blocks, keyed by sub-header text
          notes: [ { entityKey, block, field, text, cell, file } ],   // instruction text found in Fit-Gap / Detailed Gap cells
          sources: [fileName] }
```
The taxonomy is never edited; findings that would change it go to `taxonomyRequests` (increment 2).

### Assessment (one per entity × activity, however many files contain it)
```
Assessment {
  key, entityKey, processId,
  asIs:  { le, gbs, systems, gap, gapRaw, info },      // Ops pre-assessment; gap normalised, gapRaw = cell text
  fitGapPreset:      { local, other, gbs, fte },       // values already present in the file (rare)
  detailedGapPreset: { itSystems, workflowTools, currentProcess, externalParty, language, legal, controls },
  importStatus: 'OUT_OF_SCOPE' | null, importStatusReason,
  workshop: {                                          // filled on site (increment 2) – NEVER touched by (re-)import
    status: 'CONFIRMED_FIT' | 'CHANGED' | 'GAP' | 'OPEN_QUESTION' | 'OUT_OF_SCOPE' | null,
    gapType, rationale,
    fitGap: { local, other, gbs, fte },
    detailedGap: { itSystems, workflowTools, currentProcess, externalParty, language, legal, controls, na },
    deviation: { dimensions: ['Business'|'IT Systems'|'Legal'], resolution: 'SEPARATE_VARIANT'|'CLOSE_BEFORE_GOLIVE'|'LIFT_AND_SHIFT',
                 justification, owner, targetDate, escalation: 'L1'|'L2'|'L3'|'STEERCO', approval: 'PROPOSED'|'APPROVED'|'REJECTED' } | null,
    comment, nextStep, owner, due, changedAt, session },
  sources: [fileName], importedAt }
```

### Gap types (normalised)
`NO_GAP | HARMONIZATION | STANDARDIZATION | BOTH | NA | OUT_OF_SCOPE | UNCLEAR`, plus `EMPTY` for cells without a value. Mapping is in the template profile (`values.gap`); unmapped text → `UNCLEAR` and listed in the import report.

### AuditEntry
```
{ ts, kind: 'import'|'reimport'|'reimport-apply'|'edit'|'bulk'|'settings', entityKey, processId, field, old, new, session, editor }
```

### FileImport (import log + detected structure)
```
{ id, name, sheetName, importedAt, version, profileId,
  structure: { headerRow, idCols, blocks: [ { key, label, perEntity, entity, colStart, colEnd, title, fields: { [field]: { col, letter, header, score } }, unmapped } ], entities, unassigned, sheets },
  stats, warnings: [ { level, code, msg } ], notes, unmapped: { gap, yn, num } }
```

### FlowImage (increment 5)
```
{ stream, l3Id, label, dataUrl, sheet, file, manual }
```

## Merge rules
- **Entities** merge by code across files; without code by normalised name + confirmation flag.
- **Processes** upsert by Process ID; name/description/To-Be changes from a newer file are applied and listed; `sources` accumulates file names (I2C_CMD ⊂ I2C → both listed; write-back goes to every source).
- **Assessments**: new rows are added; existing rows keep `workshop` untouched. Different Ops as-is values or a changed out-of-scope status go to `pendingDiffs` for review (Apply = update as-is + audit entry; Keep = ignore).
- Re-importing the same file name bumps `files[].version`.

## Open points for your OK
1. `UNCLEAR` as the landing bucket for `?`, `tbd` and unknown GAP text – or should unknown text stay `EMPTY` and only `?` be `UNCLEAR`?
2. Out of scope: currently any "Out of scope" in Fit-Gap/Detailed Gap cells **or** in the GAP column marks the entity × activity. Confirm that the GAP column can also carry it.
3. A2R sub-streams are derived from L1/L2 names matching "fixed asset / asset accounting" vs. "inventory". If the real file uses other wording, the regex sits in `profile.streams.subStreams`.
4. Master-data nodes: match on "Master Data" in the node name, inherited by children. Confirm this is enough for the MD session filter (or give me the L2/L3 IDs).
5. Instruction-text detection is pattern-based (`to be copied`, `to be filled`, `please …`, `fill in`, `copy the/this`, `see sheet/tab`). Send me the real phrases and I extend the list.
