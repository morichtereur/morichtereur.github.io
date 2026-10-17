# Data model – proposal for review

Status: proposal (increment 0). Everything below is implemented in `src/model/` and
`src/parser/` and exercised by `npm test` against the generated demo workbooks.
Real pilot files have not been seen yet – run `npm run inspect -- <folder>` on them
and compare the printout with the assumptions in section 4.

## 1 Session file (one JSON, autosaved to IndexedDB, downloadable)

```
Session {
  version: 1, id, createdAt, updatedAt,
  settings: { clientName, country, workshopDates[], facilitators[], logoDataUrl,
              streamsInScope{R2R,A2R-FAA,A2R-IA,I2P,I2C,ICO,MD}, gapDefinitions{}, minutesPerActivity{NO_GAP,GAP}, editorInitials },
  entities:    { [code]: Entity },          // code = 6-digit code, or "name:<fuzzykey>" when the label has none
  processes:   { [processId]: Process },
  assessments: { [entityCode + '::' + processId]: Assessment },
  files[]:       import records (name, sheet, profileId, importedAt, entities, streams, layout, warnings)
  participants[]: { id, name, role, organisation: Local | GBS Ops | Transition | Process Expert }
  sessions[]:    { id, date, start, end, stream | 'MD', participantIds[], recording, note }
  activeSessionId,
  audit[]:       { ts, key, field, old, new, sessionId, editor, bulkId? }   // every change, incl. bulk confirmations
  feedback[]:    { ts, view, note, sessionId }
  taxonomyChangeRequests[]: { id, processId, proposedChange, reason, raisedBy, sessionId }
  pendingEntityMatches[]:   entities without code that matched an existing one only fuzzily – user confirms
  importDiffs[]: { ts, key, field, old, new, file }  // Ops pre-assessment values changed by a re-import
  flows[]:       { id, stream, l3Id, label, dataUrl, file, sheet }
}
```

Entity   `{ code, name, displayName, country, hasCode, sources[] }` – merged across files by code.
Process  `{ id, level 0–5, name, description, stream, parentId (by position), structuralParentId (from the ID), toBe{ le, gbs, system, initiative, extra{} }, sources[] }`
          Levels 0–3 are hierarchy nodes, 4–5 are activities. The taxonomy is never edited by the tool.

Assessment (one per entity × activity, whatever the number of files containing it):
```
{
  entityCode, processId, stream, key,
  asIs:        { le, gbs, systems, gap, gapRaw, info, extra{} }          // Ops pre-assessment, refreshed on re-import (diff recorded)
  fitGap:      { local, other, gbs, fte, extra{} }                        // workshop step 1 (imported if pre-filled)
  detailedGap: { itSystems, workflowTools, currentProcess, externalParty, languageRequirements, legalRegulatory, internalControls, extra{} }
  scope:       { outOfScope, source: 'ops-gap' | 'fitGap.<field>' | 'workshop', reason }
  notes[]:     { kind: 'instruction', field, text, cell }                  // instruction text found in capture cells
  workshop:    { status: NOT_ASSESSED | CONFIRMED_FIT | CHANGED_VS_OPS | GAP_CONFIRMED | OPEN_QUESTION | OUT_OF_SCOPE,
                 gapType (pre-filled from asIs.gap), rationale, comment, nextStep, owner, due, changedAt }
  deviation:   null | { dimensions[BUSINESS|IT_SYSTEMS|LEGAL], resolution: SEPARATE_VARIANT | CLOSE_BEFORE_GO_LIVE | LIFT_AND_SHIFT,
                 justification, ownerId, targetDate, escalation: L1|L2|L3|STEERCO, approval: PROPOSED|ALIGNED|APPROVED|REJECTED,
                 initiativeCandidate (bool, auto for STANDARDIZATION), linkedInitiative }
  sources[]:   { file, sheet, row, cells: { asIs{field: 'AB12'}, fitGap{…}, detailedGap{…} } }   // exact cells for write-back
}
```
Y/N cells are `true | false | null`; unrecognised text is kept as `{ text }`. GAP values are normalised to
`NO_GAP | HARMONIZATION | STANDARDIZATION | BOTH | NA | OUT_OF_SCOPE | UNCLEAR` (unmapped → UNCLEAR + report).

## 2 Rules implemented in the merge (`mergeParsedWorkbook`)
- Entities merge by 6-digit code. Without code: name similarity ≥ 0.85 merges automatically, 0.60–0.85 goes to `pendingEntityMatches`.
- Processes merge by Process ID; renamed processes are reported, To-Be fields fill gaps only.
- Assessments merge by entity × Process ID. New Ops (As-Is) values are applied and every change is logged in `importDiffs`.
  Anything touched in the workshop (`workshop.changedAt` set) is never overwritten.
- Every source file is kept per process and per assessment, so write-back can address every workbook that contains the activity.

## 3 Template profile #1 (`src/parser/profiles.js`) – how detection works
1. Main sheet: name starts with `fit-gap` (case-insensitive, trailing spaces ignored); names ending in `old`, `vold`, `_v<n>` are ignored; several candidates → user picks.
2. Header row: first row with a cell equal to "Process Level" in the first 12 columns. Core columns (Level, ID, Process, Activity description) are matched by header text.
3. Band = up to 6 rows above the header, columns right of the core columns. Cells ≤ 80 chars matching an anchored title pattern become block titles
   (TO-BE, AS-IS, FIT-GAP incl. "ASSSSMENT", DETAILED GAP, PROCESS INFORMATION, AUTOMATION, CHANGE IMPACT, RACI).
   Column span = merged range if the title is merged, else up to the next title. Without an AS-IS title, the "Activity Split As-is" sub-header starts the block (R2R).
4. Entity labels = band cells with a 6-digit code or a legal-form token (SAS, SARL, GmbH, Ltd …). A per-entity block takes the label inside its span;
   several labels inside one span split it; no label → paired by position with a warning.
5. Fields inside a block: the texts of the header row and the two rows above it per column, fuzzy-matched (exact key → containment → Dice ≥ 0.75) against the
   profile's synonyms. Unmatched columns are kept as `extra` so nothing is lost.
6. Data rows: Level is an integer 0–5 and ID matches `^(R2R|A2R|I2P|I2C|ICO)\b`. Everything else is skipped and counted.
   "Out of scope" in any Fit-Gap/Detailed cell → OUT_OF_SCOPE; instruction-like text → note + warning, never a value.

## 4 Assumptions to verify against the real files
- Block arrangement per entity (`AS-IS | FIT-GAP | DETAILED` repeated per entity) or per kind (all AS-IS, then all FIT-GAP …) – both are handled, but only the former has been tested.
- The entity label is in the band above each block (not only above the first block of an entity).
- Sub-headers sit at most two rows above the header row.
- The To-Be block has LE / GBS / System / Planned initiative columns (any subset).
- A2R sub-stream (FAA vs. IA) is derived from the L1/L2 names ("asset" vs. "inventory") – a configurable rule, not yet in the profile.

## 5 Open decisions
- Ops values on re-import: currently "newest file wins, diff for review". Alternative: hold the new values until the user accepts each diff.
- Pre-filled Fit-Gap/Detailed values in a capture sheet are imported as workshop input; confirm that this is wanted (vs. treating them as Ops noise).
- Entity `displayName` is editable; exports use displayName, write-back uses the original label.
