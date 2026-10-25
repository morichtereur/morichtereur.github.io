// Full tour (~5 min): every step of the workbench with demo data. Run by scripts/walkthrough.mjs (TOUR=full, default).
export const meta = {
  narration: 'narration.json',
  chapters: { COUNTRIES: 'Several countries', INTRO: 'Introduction', OVERVIEW: 'Start here', 'STEP 1': '1 · Plan & prepare', 'STEP 2': '2 · Workshop', 'STEP 3': '3 · Present', 'STEP 4': '4 · Results', 'STEP 5': '5 · QG2 sign-off & hand-over' },
  title: 'GBS Fit-Gap Workbench – walkthrough', comment: 'Plan · Workshop · Present · Results · QG2 · Hand-over',
  thumb: { h1: 'From capture sheets to QG2 sign-off.', p: 'Plan · Workshop · Present · Results · Hand-over – one offline file.', pill: (ms) => `${Math.max(1, Math.round(ms / 60000))}-minute walkthrough` },
};

export async function run({ page, sleep, overlay, title, titleOff, say, hush, moveTo, click, type, speak, chapterMark, out, sgFiles, resolve }) {
  await page.goto('file://' + resolve('dist/index.html')); await page.waitForSelector('dialog[open]');
  await overlay();
  // The modal dialog sits in the browser's top layer, above any overlay – hide it while the title card plays.
  await page.evaluate(() => { document.querySelector('dialog[open]').style.visibility = 'hidden'; });
  await title('GBS Fit-Gap Workbench', 'Plan, run and sign off a country fit-gap.', 'One offline file. Capture sheets in, workshop decisions out – with an audit trail, present mode and the hand-over package.');
  await sleep(speak(4200)); await titleOff(); await sleep(700);
  await page.evaluate(() => { document.querySelector('dialog[open]').style.visibility = ''; }); await sleep(600);

  await say('It opens from a single HTML file – no install, no server, no network. Everything is saved in the browser.', 3600, '');
  await click('dialog button:has-text("Try with demo data")', { after: 900 });
  await page.waitForSelector('.wtable tr.act', { timeout: 60000 });
  await say('Demo data: a fictional group with three entities and all five streams, exactly like a real capture workbook set.', 3400, '');
  await hush();

  // Start here
  await click('.side-nav > .side-nav-item:has-text("Start here")'); await page.waitForSelector('.hero');
  await say('Start here shows the five steps and where you are. The client logo and name come straight from the workbooks.', 4000, 'OVERVIEW');
  await moveTo('.hero-stats', { pause: 1200 });
  await say('Entities, streams, activities, progress and deviations – live, from the session.', 2800, '');
  await hush();

  // Plan
  await click('.side-nav > .side-nav-item:has-text("Plan")'); await page.waitForSelector('.brand-settings');
  await say('Step 1 · Plan & prepare: client, country, your initials for the audit trail, logo and brand colour.', 3600);
  await moveTo('.brand-settings', { pause: 900 });
  await page.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' })); await sleep(900);
  await say('People in the room and one session per stream. The traffic light tells you what is still missing before the workshop.', 3800, '');
  await hush();

  // Pre-assessment check (Files & exports)
  await click('.side-nav > .side-nav-item:has-text("Workshop")');
  { const fe = page.locator('button:has-text("Files & exports")'); if (await fe.count()) await click('button:has-text("Files & exports")'); }
  await page.waitForSelector('button:has-text("Pre-assessment check")');
  await say('Before the workshop: the pre-assessment check. Every empty GAP, missing split or unexplained gap, cell by cell – as an Excel list for GBS Operations, with a readiness light per entity and stream.', 5200, '', async () => {
    await click('button:has-text("Pre-assessment check")', { after: 1200 });
    await moveTo('.qc-table', { pause: 1500 });
  });
  await hush();

  // Workshop
  await click('.side-nav > .side-nav-item:has-text("Workshop")');
  { const back = page.locator('button:has-text("Back to the workshop")'); if (await back.count()) await back.first().click(); }
  await page.waitForSelector('.wtable tr.act');
  await say('Step 2 · Workshop: the process tree on the left, one row per activity, the entities side by side.', 3800);
  await moveTo('.tree-node.sel', { pause: 900 });
  await moveTo('.wtable thead th >> nth=1', { pause: 900 });
  await say('Every cell shows the Ops pre-assessment. Accept all "no gap" rows in one click – and discuss only the flagged ones.', 3800, '');
  await click('.l3head .btn-primary', { after: 1200 });
  await say('Fit, Gap or ? per entity. Ops was unsure here – it becomes an open question with one click.', 3400, '');
  await click('.wtable tr.act >> nth=1 >> .qbtn.q >> nth=0', { after: 900 });
  await click('.wtable tr.act td.ent .pill >> nth=0', { after: 900 });
  await page.waitForSelector('.expand-inner');
  await say('Open a cell for the full form: activity split, FTE, the detailed gap fields, gap type, rationale and the deviation block.', 4000, '');
  await moveTo('.expand-inner .yn >> nth=0', { pause: 500 });
  await click('.expand-inner .yn >> nth=0 >> button >> nth=0', { after: 700 });
  await say('Every change is logged with session, editor and timestamp – the audit trail is built in.', 3000, '');
  await hush();
  await page.keyboard.press('Escape'); await sleep(400);

  // Flow board
  await click('.yn button:has-text("Flow board")'); await page.waitForSelector('.board-grid .stepcard');
  await say('The same process group as a flow board: lanes for Local, Other party and GBS, one card per step, hand-offs between lanes.', 4000);
  await click('.board-grid .stepcard >> nth=1', { after: 900 });
  await say('Click a step to capture who performs it and what is different from the global standard.', 3200, '');
  await click('.board-detail .gapbtns .pill-HARMONIZATION', { after: 900 });
  await type('.board-detail textarea', 'Approval done locally in Excel, not in the workflow tool');
  await hush();
  await click('.yn button:has-text("Table")', { after: 400 });

  // Present mode
  await click('.l3head button:has-text("Present")'); await page.waitForSelector('.present .board-grid');
  await page.keyboard.press('Home'); await sleep(900);
  await say('Step 3 · Present: full-screen slides for the room. Cover with the client logo, scope, gap types, then one process group after another.', 4200);
  await page.keyboard.press('ArrowRight'); await sleep(1600);
  await page.keyboard.press('ArrowRight'); await sleep(1600);
  await page.keyboard.press('ArrowRight'); await sleep(1200);
  await say('Flow boards in present mode are editable: who performs a step, its hours per month (turned into FTE) and what is different.', 3600, '', async () => {
    await click('.present .board-grid .stepcard >> nth=2', { after: 900 });
    await click('.present .board-detail .yn >> nth=0 >> button >> nth=0', { after: 700 });
    await click('.present .board-detail .fte-row .chip:has-text("8 h")', { after: 900 });
    await click('.present .board-detail .gapbtns .pill-STANDARDIZATION', { after: 700 });
  });
  // Poster inset for the thumbnail: the flow board with a step being edited, without caption and cursor.
  await page.screenshot({ path: resolve(out, '_present.png'), style: '#vt-cap, #vt-cur, #vt-ring { visibility: hidden !important; }' });
  await page.keyboard.press('ArrowRight'); await sleep(1400);
  await say('The table slide shows the entities side by side, with the findings per cell.', 2800, '');
  await page.keyboard.press('End'); await sleep(1800);
  await say('The closing slide: what was assessed, open points, next session.', 2800, '');
  await hush(); await page.keyboard.press('Escape'); await page.waitForSelector('.present', { state: 'detached' }); await sleep(400);

  // Results
  await click('.side-nav > .side-nav-item:has-text("Results")'); await page.waitForSelector('.board-cols');
  await say('Step 4 · Results: every deviation on one board. Resolution approach, accountable owner, escalation level, approval status.', 4000);
  await moveTo('.dev-card >> nth=0', { pause: 800 });
  await click('.dev-card .btn-primary >> nth=0', { after: 900 });
  await page.evaluate(() => window.scrollBy({ top: 700, behavior: 'smooth' })); await sleep(1000);
  await say('Below: activity split versus plan, Ops versus workshop, the change matrix and the cross-entity view.', 3600, '');
  await hush();

  // QG2 + hand-over
  await click('.side-nav > .side-nav-item:has-text("Sign-off")'); await page.waitForSelector('text=Sign-off per stream');
  await say('Step 5 · QG2 sign-off: readiness per entity and stream, and the sign-off fields for Process Expert and GBS Operations.', 3800);
  await click('.side-nav > .side-nav-item:has-text("Hand-over")'); await page.waitForSelector('text=Package contents');
  await say('The hand-over package: deviation log, separate variants for the DTPs, initiative candidates, taxonomy change requests, QG2 summary, flat export, audit trail.', 4200, '');
  await moveTo('button:has-text("Download hand-over package")', { pause: 900 });
  await say('And the write-back: the workshop results go into the original capture workbooks – values only, formatting kept.', 3600, '');
  await hush();

  // Several countries: country prompt on import, then the country filter in the sidebar
  await click('.side-nav > .side-nav-item:has-text("Workshop")');
  { const fe = page.locator('button:has-text("Files & exports")'); if (await fe.count()) await click('button:has-text("Files & exports")'); }
  await page.waitForSelector('.dropzone input[type=file]', { state: 'attached' });
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await say('Several countries? Drop the next country\'s capture sheets in. The tool asks first: a separate session, or add them to this one.', 4400, 'COUNTRIES', async () => {
    await moveTo('.dropzone', { pause: 600 });
    await page.setInputFiles('.dropzone input[type=file]', sgFiles);
    await page.waitForSelector('.card:has-text("new country")'); await sleep(900);
    await moveTo('button:has-text("Add to this session")', { pause: 900 });
  });
  await click('button:has-text("Add to this session")', { after: 600 });
  await page.waitForSelector('#side-country'); await page.waitForFunction(() => document.querySelectorAll('.filerow .st.ok, .filerow .st.warn').length >= 5, null, { timeout: 60000 }); await sleep(800);
  await say('The country filter in the sidebar switches every view, slide and export. Nothing is lost – the session file keeps all countries.', 4400, '', async () => {
    await moveTo('#side-country', { pause: 1200 });
    await page.selectOption('#side-country', 'France'); await sleep(1500);
    await page.selectOption('#side-country', 'Singapore'); await sleep(1200);
  });
  await hush();

  chapterMark('Summary');
  await title('GBS Fit-Gap Workbench', 'Capture sheets in. Decisions out.', 'Plan · Workshop · Present · Results · QG2 · Hand-over. One file, offline, with the full audit trail.');
  await sleep(speak(4000) + 600);
}
