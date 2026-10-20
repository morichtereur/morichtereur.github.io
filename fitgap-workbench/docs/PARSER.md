# Parser – how the layout is detected (template profile #1)

Nothing is column-letter based. All rules live in `src/js/10-profile.js`; the engine is `src/js/20-parser.js`.

1. **Sheets** – main sheet: name starts with `Fit-Gap`/`Fit-gap` (trailing spaces tolerated); names ending in `old`, `vold`, `_v<n>` are ignored; more than one remaining candidate → the user picks. `Process Flows_*` sheets are counted (images: increment 5). Everything else is ignored.
2. **Grid** – the sheet is read as a grid anchored at A1 (so an empty column A does not shift indices) and merged cells in the title rows are filled with their top-left value.
3. **Header row** – first row (within 40) whose cell in column B equals `Process Level`; falls back to any column. Columns for Process ID / Process / Activity description are found by header text next to it (fallback: the three columns to the right).
4. **Blocks** – cells in the 3 rows above the header (and the header row) are matched fuzzily against block titles: `TO BE PROCESS SPECIFIC INFORMATION`, `PRE-FILLED AS-IS PROCESS SPECIFICATION`, `FIT-GAP ASSESSMENT` (also `ASSSSMENT`), `DETAILED GAP ASSESSMENT`, `PROCESS (SPECIFIC) INFORMATION (IF NEEDED)`, `AUTOMATION ANALYSIS`, `CHANGE IMPACT ANALYSIS`, `RACI Matrix`. A merged title spans its merge; an un-merged one spans to the next title. Columns without a title are assigned by marker text (`Activity Split As-is` → Ops as-is block – the R2R case).
5. **Entities** – labels `<6 digits> <name>` in the title rows; a column belongs to the nearest label at or to its left. Suffixes in parentheses are stripped. Without any coded label, free text in the title rows is used and flagged for confirmation.
6. **Fields** – per block instance, each column's sub-header texts (2 rows above header + header row) are scored against field synonyms (exact > contains > similarity ≥ 0.8). Duplicates and low-confidence matches are reported; unmatched columns are listed per block.
7. **Rows** – a data row needs level ∈ 0…5 and a Process ID matching `^(R2R|A2R|I2P|I2C|ICO)\b`. Others are skipped and counted (ICO's stray header rows). `\xa0` counts as empty. Duplicate IDs within a file: first wins.
8. **Values** – GAP → normalised code (typos, case); Y/N → `Y`/`N`/`NA`; FTE → number; `Out of scope` in Fit-Gap/Detailed Gap cells or GAP → `OUT_OF_SCOPE`; instruction text → note; any other pre-filled Fit-Gap/Detailed Gap value → preset.

Run `node scripts/inspect.mjs <files…>` to print the detected structure per file, or open the file row in the import summary.

Verified against the generated demo workbooks (`npm run demo`), which reproduce: header rows 6/8/9, R2R without AS-IS title, `ASSSSMENT` typo, old sheets, trailing-space sheet name, lower-case `Fit-gap`, entity order differing per file, suffix `(Legal entity)`, un-merged titles/labels (ICO), stray header rows, hundreds of `Out of scope` rows, instruction text, GAP typos (`HARMINIZATION`, `BOTH GAPs`, `?`), an unmapped GAP value, and the I2C_CMD ⊂ I2C overlap.

Not yet verified against the real pilot files – put them in `samples/` (git-ignored) and run the inspector.
