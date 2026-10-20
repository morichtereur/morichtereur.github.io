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
