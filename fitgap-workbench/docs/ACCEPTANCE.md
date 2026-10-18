# Acceptance test – pilot dry run

Run: 2026-10-18 11:53 UTC · build 0.1.0 · headless Chromium, network blocked, file:// · 11 s
Result: **PASSED** (8/8)

| # | Step | Result | Detail |
|---|---|---|---|
| 1 | Import 6 capture workbooks with network disabled | pass | entities=3 activities=180 assessments=540 outOfScope=54 failed=0 |
| 2 | PLAN-lite: client, country, initials, participant, session | pass |  |
| 3 | Simulated R2R session: bulk confirm + 3 deviations with owner and resolution | pass | "7 activities confirmed as fit", deviations=3, audit=124 |
| 4 | Close browser and reopen: data still there (IndexedDB) | pass | assessments=540 audit=124 deviations=3 |
| 5 | JSON save on laptop A, load on laptop B (fresh browser) | pass | Demo_Group_France_session_20261018-1153.json (753 KB), audit=124 |
| 6 | Deviation log .xlsx: valid package, 4 sheets, decided deviations carry owner / approach / session | pass | Demo_Group_France_deviation-log_20261018-1153.xlsx: 207 rows, 3 decided, sheets=Deviation log/Initiative candidates/Taxonomy change requests/About |
| 7 | Flat export .xlsx: one row per entity × activity + audit log | pass |  |
| 8 | Zero network requests, zero console errors during the whole run | pass | network=0 errors=0 |

Data: generated demo workbooks (`npm run demo`), not client data.

## Manual checks still required before Monday 13:00
- Open the deviation log and the flat export in Excel on the corporate laptop: no repair prompt expected (the package is a standard SheetJS xlsx; validated here by re-reading it with SheetJS and JSZip only).
- Open `dist/index.html` on the corporate laptop with Wi-Fi off in Edge: welcome dialog, fonts rendered (serif page title), import of the real capture sheets.
- Run `npm run inspect -- <folder with the real files>` and compare blocks / entities / field mapping with the capture sheets.

Re-run: `npm run build && node scripts/acceptance.mjs`.
