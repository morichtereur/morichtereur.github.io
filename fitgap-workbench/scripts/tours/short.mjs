// Short tour (~90 s): the value story for a management audience, with demo data. TOUR=short node scripts/walkthrough.mjs <out>
export const meta = {
  narration: 'narration-short.json',
  chapters: { INTRO: 'Introduction', IMPORT: 'Capture sheets in', CHECK: 'Pre-assessment check', WORKSHOP: 'Workshop', AUDIT: 'Audit trail', PRESENT: 'Live capture', RESULTS: 'Results', 'HAND-OVER': 'QG2 & hand-over', COUNTRIES: 'Several countries' },
  title: 'GBS Fit-Gap Workbench – 90-second overview', comment: 'Faster, consistent, audit-ready country fit-gap workshops',
  thumb: { h1: 'Fit-gap workshops, faster and audit-ready.', p: 'Capture sheets in · decisions out – one offline file.', pill: (ms) => `${Math.round(ms / 1000)}-second overview` },
};

export async function run({ page, sleep, overlay, title, titleOff, say, hush, moveTo, click, speak, chapterMark, out, sgFiles, resolve }) {
  await page.goto('file://' + resolve('dist/index.html')); await page.waitForSelector('dialog[open]');
  await overlay();
  await page.evaluate(() => { document.querySelector('dialog[open]').style.visibility = 'hidden'; });
  await title('GBS Fit-Gap Workbench', 'Country fit-gap workshops – faster, consistent, audit-ready.', 'From the GBS Operations capture sheets to QG2 sign-off, in one offline file.');
  await sleep(speak(4500)); await titleOff(); await sleep(500);
  await page.evaluate(() => { document.querySelector('dialog[open]').style.visibility = ''; }); await sleep(300);

  await say('Five capture workbooks per country – thousands of rows, pre-assessed by GBS Operations.', 4200, 'IMPORT', async () => {
    await click('dialog button:has-text("Try with demo data")', { after: 300 });
    await page.waitForSelector('.wtable tr.act', { timeout: 60000 });
  });
  await say('Read as they are, in seconds. One offline file: no installation, no server, no data leaving the laptop.', 5200, '', async () => {
    await click('button:has-text("Files & exports")', { after: 600 });
    await moveTo('.matrix >> nth=0', { pause: 1200 });
  });
  await hush(); await sleep(700);

  await say('Before the workshop: a quality check shows GBS Operations which pre-assessment cells are still missing.', 4800, 'CHECK', async () => {
    await click('button:has-text("Pre-assessment check")', { after: 900 });
    await moveTo('.qc-table', { pause: 1200 });
  });
  await hush(); await sleep(900);

  await click('button:has-text("Back to the workshop")', { after: 500 }); await page.waitForSelector('.wtable tr.act');
  await say('In the room: confirm the no-gap rows in bulk – and spend the time on the real gaps.', 4400, 'WORKSHOP', async () => {
    await click('.l3head .btn-primary', { after: 900 });
    await moveTo('.wtable tr.act >> nth=3', { pause: 900 });
  });
  await hush(); await sleep(500);
  await say('Every decision logged – who, when, in which session. A complete audit trail for the quality gates.', 4800, 'AUDIT', async () => {
    await click('.wtable tr.act td.ent .pill >> nth=0', { after: 600 }); await page.waitForSelector('.expand-inner');
    await click('.expand-inner .yn >> nth=0 >> button >> nth=0', { after: 350 });
    await click('.expand-inner .yn >> nth=1 >> button >> nth=1', { after: 350 });
    await click('.expand-inner .yn >> nth=2 >> button >> nth=1', { after: 350 });
    await click('.expand-inner button:has-text("History")', { after: 300 });
    await moveTo('.expand-inner button:has-text("History")', { dy: 60, pause: 1200 });
  });
  await hush(); await page.keyboard.press('Escape'); await sleep(600);

  await click('.l3head button:has-text("Present")', { after: 300 }); await page.waitForSelector('.present .board-grid');
  await page.keyboard.press('Home'); await sleep(300);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await sleep(350); }
  await say('Effort captured live in hours per month and converted into FTE – a clear baseline for the transition.', 5000, 'PRESENT', async () => {
    await click('.present .board-grid .stepcard >> nth=2', { after: 500 });
    await click('.present .board-detail .performer >> nth=0 >> button >> nth=0', { after: 400 });
    await click('.present .board-detail .fte-row .chip:has-text("8 h")', { after: 700 });
    await page.screenshot({ path: resolve(out, '_present.png'), style: '#vt-cap, #vt-cur, #vt-ring { visibility: hidden !important; }' });
  });
  await sleep(600); await hush(); await page.keyboard.press('Escape'); await page.waitForSelector('.present', { state: 'detached' }); await sleep(300);

  await click('.side-nav > .side-nav-item:has-text("Results")'); await page.waitForSelector('.board-cols');
  await say('All deviations on one board – resolution approach, owner and approval status.', 4400, 'RESULTS', async () => {
    await moveTo('.dev-card >> nth=0', { pause: 900 });
    await moveTo('.dev-card >> nth=2', { pause: 900 });
  });
  await hush(); await sleep(500);
  await say('Results go straight into the deviation log, the QG2 sign-off and back into the original workbooks.', 4800, 'HAND-OVER', async () => {
    await click('.side-nav > .side-nav-item:has-text("Hand-over")', { after: 300 }); await page.waitForSelector('text=Package contents');
    await moveTo('button:has-text("Download hand-over package")', { pause: 900 });
  });
  await hush(); await sleep(600);

  await click('.side-nav > .side-nav-item:has-text("Workshop")'); await sleep(300);
  { const fe = page.locator('button:has-text("Files & exports")'); if (await fe.count()) await fe.first().click(); }
  await page.waitForSelector('.dropzone input[type=file]', { state: 'attached' }); await page.evaluate(() => window.scrollTo({ top: 0 }));
  await say('Several countries side by side – one filter away.', 3200, 'COUNTRIES', async () => {
    await page.setInputFiles('.dropzone input[type=file]', sgFiles);
    await page.waitForSelector('.card:has-text("new country")'); await sleep(300);
    await click('button:has-text("Add to this session")', { after: 300 });
    await page.waitForSelector('#side-country'); await page.waitForFunction(() => /2 entities · 5 streams/.test(document.querySelector('.page-head')?.textContent || ''), null, { timeout: 60000 });
    await moveTo('#side-country', { pause: 500 });
    await page.selectOption('#side-country', 'France'); await sleep(1200);
    await page.selectOption('#side-country', 'Singapore'); await sleep(1000);
  });
  await hush();

  chapterMark('Summary');
  await title('GBS Fit-Gap Workbench', 'One file. Every country. Decisions you can trace.', 'Plan · Workshop · Present · Results · QG2 · Hand-over – offline, with the full audit trail.');
  await sleep(speak(3500) + 600);
}
