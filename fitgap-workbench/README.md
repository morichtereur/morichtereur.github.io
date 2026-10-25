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

`npm run video` records a guided tour with demo data (captions, visible cursor, title cards) to `dist/video/`:
`walkthrough.mp4` (1920×1080, H.264, chapters per step, title metadata), `walkthrough.webm`, `thumbnail.png`
(poster frame) and – with voice-over – `walkthrough.srt` / `.vtt` built from the spoken text
(`scripts/subtitles.mjs`: ≤ 42 characters per line, ≤ 2 lines, split at sentence and clause breaks).
`VIDEO_W` / `VIDEO_H` change the size. The tour is scripted in `scripts/walkthrough.mjs` – edit the
captions there and re-record after UI changes. Uses the pre-installed Chromium; no network.

Voice-over (English, Kokoro-82M, Apache-2.0, runs offline on CPU):

1. Model files once, into any folder outside the repo: join the 6 parts of the npm package `kokoro-q8-shards`
   into `model_q8.onnx` (sha256 `fbae9257…a1478`), and build `voices.npz` from `voices/*.bin` of the npm package
   `kokoro-js` (float32, reshape to 510×1×256 per voice).
2. `pip install kokoro-onnx soundfile`, then `python scripts/narrate.py <model-dir> <clips-dir>` – the text is in
   `scripts/narration.json` (one line per caption, in tour order; default voice `af_heart`, `--voice` to change).
3. `NARRATION=<clips-dir>/manifest.json npm run video` – every scene holds as long as its sentence, the clips are
   mixed in at the moment their caption appears and normalised to -16 LUFS.

If eSpeak complains about a missing `phontab` under `/home/runner/work/espeakng-loader/…`, symlink that path's
`espeak-ng-data` to the `espeak-ng-data` folder inside the installed `espeakng_loader` package.

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
16. Pre-assessment check before the workshop (`src/model/qc.js`; button under Files & exports, or
    `node scripts/qc-preassessment.mjs <country-folder> [--reference <other-country-folder> ...] [--out file.xlsx]`):
    readiness per entity × stream (GAP filled, As-Is/To-Be split filled, system filled, gaps explained → Green / Amber /
    Red) and one finding per cell with file, sheet and cell address – empty GAP / split / system, gap or N/A without
    reason, split vs. GAP contradictions, duplicate IDs, rows without ID, missing level, entity without label or code,
    entity code used twice, workshop columns already filled; with `--reference` also activities missing or added
    against other countries. Excel with Summary, Issues (Status / Comment Ops columns for GBS Ops), Checks, About.
    Parser: entity labels without a code are recognised by their position above the block (e.g. a hub next to the
    legal entity), and a second block for the same entity is reported and skipped instead of overwriting the first.
    Write-back only writes values the workshop changed: cells whose value is still the one imported (e.g. an Ops "x"
    for Yes, a pre-filled Detailed Gap text) stay exactly as they are – original notation, spacing and string type.
    One country per session: dropping files of another country (country from the file name) asks first – "Save
    <country> session & start <new country>" downloads the current session as JSON and starts an empty one (initials
    and effort settings kept), or "Add to this session". Entities of older sessions without a stored country get it
    from their file names, so unlabelled files of a second country no longer end up as "<country> (no entity label)".
    Country filter (sidebar, shown once a session holds two or more countries): every page – workshop, present mode,
    KPIs, results, QC, exports – reads `countryView(session, settings.countryFilter)`; changes still go to the full
    session and "Save session" always saves all countries. Present mode shows only entities with activities in the
    stream on screen.
15. Effort in hours: local teams estimate hours per month (quick picks 1–40 h, free entry with comma or point);
    FTE = hours ÷ productive hours per FTE per month (default 140 ≈ 1,680 h a year, set under Plan & prepare → More
    settings; changing it recalculates every FTE derived from hours, logged in the audit trail). Both are stored
    (`fitGap.hours`, `fitGap.fte`); write-back fills the capture sheet's FTE column, exports carry hours, FTE and the
    basis. FTE pre-filled by Ops stays and shows as "≈ x h". Switch back to direct FTE entry in the same settings.
14. Single-entity country files (first seen with Korea): sheets without any entity label are read as one entity and
    joined to the entity of the same country on import (country from the file name, ISO codes such as `_KR`); if the
    labelled file comes later it takes over a placeholder entity, so the import order does not matter. Duplicate
    activity IDs in a sheet are kept as separate activities (`<id> (2)`) and reported instead of overwriting each
    other; repeated structure IDs with different names (e.g. two "A2R" headers for Asset and Inventory Accounting)
    become separate process groups; an empty Process Level is taken from the ID; sheet ranges stretched to row
    1,048,576 by column formatting are read only to the last filled cell (44 s → 0.2 s). FTE capture in present
    mode: FTE field with quick picks in the flow-board panel, FTE badge on step cards, Σ FTE per process group, FTE
    per entity on the table slide, FTE by split class (with GBS / staying local / split open) on the stream slide.
13. Undo / redo for every workshop step (top bar, Ctrl+Z / Ctrl+Shift+Z outside text fields): each user step gets an
    action id in the audit trail; undo and redo are written to the audit trail as their own entries. Client-ready
    Excel: every export and every file of the hand-over package gets a frozen, formatted header row, column widths
    and filters (`polishXlsx` patches the package XML – SheetJS CE cannot write styles) and is DEFLATE-compressed.
12. Branding: tool mark (favicon, sidebar, welcome, present footer), client logo and brand colour (`src/ui/brand.js`).
    The client logo is picked up from the capture workbooks on import (every picture in every sheet is scored:
    first rows, a few cm wide, SVG preferred; cover backgrounds, header strips and flow screenshots lose), stored as a
    data URL in `settings.logoDataUrl`; white logos are detected (`logoOnDark`) and shown on a dark plate. Client name
    and country are derived from the entity names / file name when empty. Upload, replace, remove and brand colour live
    under Plan & prepare → step 1. Shown in the sidebar, the hero on "Start here", the cover / closing slide and the brand
    bar of every slide in present mode.
