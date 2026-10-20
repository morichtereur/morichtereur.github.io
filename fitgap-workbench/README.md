# GBS Fit-Gap Workbench

Internal, reusable consulting asset for the fit-gap phase of GBS transitions: plan, prepare, run, evaluate, sign off and hand over – per country, for any client. One self-contained `dist/index.html`, opened locally in Edge/Chrome, zero network at runtime (libraries and fonts are inlined; a CSP blocks any accidental request).

Nothing client-specific is in the code: client names, entities, taxonomy, participants and schedule come from the imported capture sheets and the settings.

## Use

1. Download `dist/index.html` and open it in Edge or Chrome (works from a network-free laptop).
2. Fill in client, country and your initials, then drop all capture sheets (R2R, A2R, I2P, I2C, ICO, I2C_CMD) at once – or click *Try with demo data*.
3. Check the import summary: entities × streams, counts, Ops gap distribution, parsing report, unmapped values, notes, and the detected structure per file.
4. The session autosaves to the browser (IndexedDB). Download a JSON backup with the save icon (Ctrl+S) at the end of every session block; load it on another laptop with the upload icon.

## Build and test

```sh
cd fitgap-workbench
npm install          # SheetJS 0.18.5 + JSZip 3.10.1, pinned
npm run demo         # writes the six demo workbooks to samples/demo/
npm test             # parser + model unit tests (node:test)
npm run build        # assembles src/ + vendor + fonts into dist/index.html
npm run smoke        # headless Chromium, offline, end-to-end (needs Playwright + Chromium)
npm run verify       # all of the above
node scripts/inspect.mjs samples/*.xlsx   # print the detected structure of real files
```

`samples/` is git-ignored – put real client files there, never commit them. `npm run demo` regenerates the demo workbooks.

## Layout

```
src/index.html        page skeleton with @fonts / @css / @vendor / @app placeholders
src/styles.css        design tokens (Splitfold consulting edition) + components
src/js/00-util.js     helpers (fuzzy matching, formatting)
src/js/10-profile.js  template profile #1 – how the capture-sheet layout is detected; gap-type definitions
src/js/15-demo.js     demo data generator ("Demo Group", 3 entities) with the real files' quirks
src/js/20-parser.js   SheetJS workbook → entities, processes, assessments, structure, warnings
src/js/30-model.js    session model: merge, re-import diffs, audit trail, derived totals
src/js/40-store.js    IndexedDB autosave, JSON save/load
src/js/50-ui-core.js  app shell, sidebar, top bar, KPI strip, dialogs, command palette, feedback
src/js/60-ui-import.js  PREPARE › Import view and summary
src/js/65-ui-phases.js  PLAN / RUN (read-only browser) / EVALUATE / QG2 / HAND-OVER states, Settings, Feedback log
src/js/70-ui-stylesheet.js  one-page style sheet for sign-off
src/js/90-main.js     boot
scripts/              build, demo workbooks, structure inspector, smoke test
docs/                 DATA_MODEL.md (for your OK), PARSER.md, ACCEPTANCE.md
fonts/                Instrument Sans, Source Serif 4, IBM Plex Mono (latin woff2, OFL)
```

Parser, model and UI are separate modules on a single `FG` namespace so the Replit port (Vite + React + TS, Express + SQLite) is mechanical.

## Increments

| # | Scope | Status |
|---|---|---|
| 1 | App shell with all six lifecycle phases, design system + style sheet, template profile #1 parser, import summary, autosave + JSON save/load, feedback button | **done** (this build) |
| 2 | PLAN-lite (country set-up, participants, session list, planning-workbook import) · RUN workshop mode (Fit-Gap, Detailed Gap, deviation block, bulk confirm, keyboard flow, audit trail per activity) | next |
| 3 | Session save/load hardening (backup prompt at session end) | partly in 1 |
| 4 | Deviation log + flat export (.xlsx) | next |
| 5–8 | Flow image extraction · present mode + QG2 view · EVALUATE board, activity split, analysis dashboard · entity swimlane | pilot week |
| 9–11 | Write-back into original workbooks · full PLAN/PREPARE/HAND-OVER · profile mapping UI, Replit port | after the pilot |

## What works, what is missing, edge cases (increment 1)

Works: everything in `docs/ACCEPTANCE.md`. Missing: all of increment 2 onwards (phases show a "coming next" state); the RUN tab is a read-only taxonomy browser to verify the parsing. Parsing edge cases handled and tested: see `docs/PARSER.md`. Not yet seen: the real pilot files – the first thing to do with them is `node scripts/inspect.mjs`.
