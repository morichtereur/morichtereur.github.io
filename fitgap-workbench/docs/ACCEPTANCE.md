# Acceptance log

## Increment 1 – offline shell, design system, parser, import summary (2026-10-20)

Automated, headless Chromium on `file://dist/index.html` with every non-file request aborted (`npm run smoke`):

| Check | Result |
|---|---|
| Boots with network blocked, embedded fonts available, no CSP violation, no console error | pass |
| Welcome dialog on first start; not shown again after reload | pass |
| 6 demo workbooks imported (1,474 activities, 3 entities, 3,261 assessments, 1,161 out of scope) | pass |
| Sidebar streams R2R, A2R-FAA, A2R-IA, I2P, I2C, ICO with Ops gap mix bars | pass |
| Autosave to IndexedDB; session survives reload | pass |
| Session JSON download (4,422 assessments incl. out of scope) | pass |
| Run browser: tree, activity table, detail panel; Ctrl+K jumps to a process ID | pass |
| Feedback button logs an entry | pass |
| Re-import of the same file: version 2, no duplicates, no diffs | pass |
| Node unit tests (parser + model, 11 tests) | pass |

Open for the Sunday dry run (needs increments 2–4): simulated R2R session incl. bulk confirm and 3 deviations, close/reopen, JSON load in a second browser, deviation log opens in Excel.

## Increment 2 – PLAN-lite + workshop mode (2026-10-20)

Same harness (`npm run smoke`, offline Chromium), on top of the increment 1 checks:

| Check | Result |
|---|---|
| PLAN: participant and session added; session started from the top bar; timer shows elapsed / planned / done / pace | pass |
| Workshop: "Confirm Ops NO GAP for this L3" confirms the eligible rows (8 in the demo L3), toast with undo reverts them, logged as bulk | pass |
| Row expands inline with one panel per entity; HARMONIZATION shows the deviation block | pass |
| Fit-Gap toggles, FTE, rationale, Detailed Gap field, dimension, separate variant + justification, owner from participant list, status → completeness green | pass |
| Audit trail per activity tagged with session and editor (14 entries for one assessment) | pass |
| FTE impact aggregated in the L3 header | pass |
| Keyboard: Esc collapses, ↓ selects next, 4 sets "Open question" | pass |
| End session prompts for a JSON backup; workshop results survive reload | pass |
| Node unit tests (parser, model, workshop, planning parser: 18 tests) | pass |

Still open for the Sunday-style dry run: deviation log export opens in Excel (increment 4), JSON load on a second browser (manual).
