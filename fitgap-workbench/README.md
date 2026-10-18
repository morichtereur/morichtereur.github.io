# GBS Fit-Gap Workbench

Internal, reusable consulting asset for the fit-gap phase of GBS transitions:
plan · prepare · run · evaluate · QG2 sign-off · hand-over, per country, for any client.
One self-contained `dist/index.html` – opens from `file://` in Edge/Chrome, makes zero
network requests (libraries and fonts are inlined), no backend. The only exception is the optional
AI support panel: when the user enters a Claude API key (kept in the browser's local storage, never in
the session file) it calls `api.anthropic.com` on request; without a key it offers "Copy prompt".

Nothing client-specific lives in this code. Client names, entities, taxonomy, participants and
schedule come only from imported files or settings. `samples/` is git-ignored: never commit capture sheets.

## Commands

```sh
npm install            # once (Node ≥ 22.12)
npm run build          # src/ → dist/index.html (single file, ~0.8 MB)
npm test               # parser + merge tests against generated demo workbooks
npm run demo           # writes fictional "Demo Group" capture workbooks to samples/demo/
npm run inspect -- samples/demo   # step-1 structure printout per workbook (+ --json out.json)
npm run smoke          # opens dist/index.html headless with network blocked, screenshots, fails on errors
npm run acceptance     # pilot dry run end-to-end, writes docs/ACCEPTANCE.md
npm start              # serves dist/index.html on $PORT (Replit / preview only – the app needs no server)
npm run package:replit # zips the project (no node_modules, no samples) for upload to Replit
```

## Explanation video

`npm run video` records a ~2:30 min guided tour with demo data (captions, visible cursor, title cards) to
`dist/video/walkthrough.mp4` (ffmpeg) and `.webm`. The tour is scripted in `scripts/walkthrough.mjs` – edit the
captions there and re-record after UI changes. Uses the pre-installed Chromium; no network.

## Replit

Upload the zip from `npm run package:replit` (or import the repository folder) into a Node.js Repl.
`.replit` runs `npm run build && npm start`; the Repl then serves the single-file app. Users can also
download `dist/index.html` from there and open it locally – the app itself never calls the network.

## Layout

```
src/model/      constants, normalisation, session model + merge rules   (pure, Node-testable)
src/parser/     template profiles + capture-sheet parser                 (pure, SheetJS workbook in → model out)
src/ui/         Preact + htm components, style sheet, app shell
src/styles/     tokens (Splitfold consulting edition), base, components
scripts/        build.mjs · inspect-samples.mjs · generate-demo.mjs · smoke.mjs
docs/           DATA_MODEL.md (proposal), ACCEPTANCE.md (pilot dry run, to come)
dist/           built single-file app (committed so it can be downloaded directly)
```

The build strips `import`/`export` from the ES modules and concatenates them in dependency order,
so the same files run in Node (tests, inspector) and in the browser. Top-level names must be unique
across modules – the build fails on duplicates.

## Increments

0. Shell with all six phases, design system style sheet, parser profile #1, demo generator, inspector
1. Import (drag & drop, per-file progress, sheet choice, entity confirmation, summary cards, layout detail), IndexedDB autosave
2. PLAN-lite (country, entities, streams, participants, sessions, planning-workbook import) + workshop mode (tree, entity columns, Fit-Gap → Detailed Gap → Deviation, bulk confirm with undo, keyboard, session timer) + audit trail
3. Session JSON save/load, backup prompt at session end
4. Deviation log (+ initiative candidates, taxonomy change requests), flat export with audit log, audit export; acceptance run  ← pilot MVP complete
5–11. flows, present mode, QG2, evaluate, swimlane, write-back, full PLAN/PREPARE/HAND-OVER, profile mapping UI
12. Branding: tool mark (favicon, sidebar, welcome, present footer), client logo and brand colour (`src/ui/brand.js`).
    The client logo is picked up from the capture workbooks on import (every picture in every sheet is scored:
    first rows, a few cm wide, SVG preferred; cover backgrounds, header strips and flow screenshots lose), stored as a
    data URL in `settings.logoDataUrl`; white logos are detected (`logoOnDark`) and shown on a dark plate. Client name
    and country are derived from the entity names / file name when empty. Upload, replace, remove and brand colour live
    under Plan & prepare → step 1. Shown in the sidebar, the hero on "Start here", the cover / closing slide and the brand
    bar of every slide in present mode.
