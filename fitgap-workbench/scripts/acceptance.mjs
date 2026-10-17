#!/usr/bin/env node
// Automated acceptance run (pilot dry run): import all demo files with the
// network blocked → simulated R2R session incl. bulk confirm and 3 deviations →
// close the browser, reopen (persistent profile) → data still there → JSON
// save, load in a second, fresh browser → deviation log export re-read with
// SheetJS. Writes docs/ACCEPTANCE.md. Usage: node scripts/acceptance.mjs
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const url = 'file://' + resolve('dist/index.html');
const results = []; const t0 = Date.now();
const step = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' – ' + detail : ''}`); };
const demoDir = mkdtempSync(resolve(tmpdir(), 'fg-acc-demo-'));
execFileSync(process.execPath, [resolve('scripts/generate-demo.mjs'), demoDir], { stdio: 'ignore' });
const demoFiles = readdirSync(demoDir).filter(f => f.endsWith('.xlsx')).map(f => resolve(demoDir, f));
const profile = mkdtempSync(resolve(tmpdir(), 'fg-acc-profile-'));
const dl = mkdtempSync(resolve(tmpdir(), 'fg-acc-dl-'));
let netAttempts = 0, consoleErrors = [];

async function open(userDataDir) {
  const ctx = await chromium.launchPersistentContext(userDataDir, { executablePath: exe, args: ['--no-sandbox'], viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.route('**/*', r => { if (!r.request().url().startsWith('file://')) { netAttempts++; return r.abort(); } return r.continue(); });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => consoleErrors.push(String(e))); page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(url); await page.waitForSelector('.sidebar');
  const dlg = await page.$('dialog[open] .btn-text'); if (dlg) await dlg.click();
  return { ctx, page };
}
const counts = (page) => page.evaluate(() => new Promise(res => { const r = indexedDB.open('gbs-fitgap-workbench'); r.onsuccess = () => { const g = r.result.transaction('sessions').objectStore('sessions').get('current'); g.onsuccess = () => { const s = g.result; res(s ? { entities: Object.keys(s.entities).length, assessments: Object.keys(s.assessments).length, audit: s.audit.length, confirmed: Object.values(s.assessments).filter(a => a.workshop.status === 'CONFIRMED_FIT').length, deviations: Object.values(s.assessments).filter(a => a.deviation?.resolution).length, sessions: s.sessions.length } : null); }; }; }));
const waitSaved = (page) => page.waitForFunction(() => /Saved/.test(document.querySelector('.saved')?.textContent || ''), null, { timeout: 15000 });

// 1 Import with network blocked
let { ctx, page } = await open(profile);
await page.click('.side-nav > .side-nav-item:has-text("Workshop")');
await page.setInputFiles('.dropzone input[type=file]', demoFiles);
await page.waitForFunction(n => document.querySelectorAll('.filerow .st.ok, .filerow .st.warn, .filerow .st.err').length === n, demoFiles.length, { timeout: 90000 });
const failed = await page.$$eval('.filerow .st.err', e => e.length);
const kpis = await page.$$eval('.kpi .value', e => e.map(x => x.textContent.trim()));
step('Import 6 capture workbooks with network disabled', failed === 0 && kpis[0] === '3' && kpis[2] === '540', `entities=${kpis[0]} activities=${kpis[1]} assessments=${kpis[2]} outOfScope=${kpis[3]} failed=${failed}`);

// 2 PLAN-lite
await page.click('.side-nav > .side-nav-item:has-text("Plan")'); await page.waitForSelector('.page-head');
for (const [ph, v] of [['e.g. Demo Group', 'Demo Group'], ['e.g. France', 'France'], ['MR', 'MR']]) { await page.fill(`input[placeholder="${ph}"]`, v); await page.press(`input[placeholder="${ph}"]`, 'Enter'); }
await page.fill('input[placeholder="Full name"]', 'M. Dupont'); await page.press('input[placeholder="Full name"]', 'Enter');
await page.fill('input[type=date]', '2026-10-19'); await page.fill('input[type=time] >> nth=0', '14:00'); await page.fill('input[type=time] >> nth=1', '15:30');
await page.click('button.btn-outline:has-text("Add") >> nth=1'); await page.click('button:has-text("Set active")');
step('PLAN-lite: client, country, initials, participant, session', (await page.$$eval('.sessions tr, table.matrix tbody tr', r => r.length)) > 0);

// 3 Simulated R2R session
await page.click('.side-nav > .side-nav-item:has-text("Workshop")'); { const back = await page.$('button:has-text("Back to the workshop")'); if (back) await back.click(); } await page.waitForSelector('.ws');
await page.click('.sessionbar .btn-primary');
await page.click('.l3head .btn-primary'); await page.waitForSelector('.toast:has-text("confirmed")');
const bulkText = (await page.textContent('.toast:has-text("confirmed")')).trim();
let devDone = 0;
for (let i = 0; i < 3 && devDone < 3; i++) {
  await page.click('.yn button:has-text("All rows")');
  const pills = page.locator('.wtable tr.act td.ent .pill-HARMONIZATION, .wtable tr.act td.ent .pill-BOTH');
  if (await pills.count() <= i) break;
  await pills.nth(i).scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -260)); await pills.nth(i).click();
  await page.waitForSelector('.expand-inner');
  await page.click('.expand-inner .yn >> nth=0 >> button >> nth=0'); await page.click('.expand-inner .yn >> nth=1 >> button >> nth=1'); await page.click('.expand-inner .yn >> nth=2 >> button >> nth=1');
  await page.selectOption('.expand-inner select >> nth=0', 'HARMONIZATION');
  await page.fill('.expand-inner input[placeholder="Short reason"]', `Local approval step ${i + 1}`); await page.press('.expand-inner input[placeholder="Short reason"]', 'Enter');
  await page.waitForSelector('.block.dev');
  await page.click('.block.dev .chip:has-text("Legal")');
  await page.selectOption('.block.dev select >> nth=0', 'SEPARATE_VARIANT');
  await page.selectOption('.block.dev select >> nth=1', { index: 1 });
  await page.fill('.block.dev textarea', 'Statutory requirement'); await page.press('.block.dev textarea', 'Tab');
  await page.fill('.expand-inner input[placeholder="Free text"] >> nth=0', 'SAP'); await page.press('.expand-inner input[placeholder="Free text"] >> nth=0', 'Enter');
  await page.keyboard.press('Escape'); await page.keyboard.press('3');
  devDone++;
}
await waitSaved(page);
const c1 = await counts(page);
step('Simulated R2R session: bulk confirm + 3 deviations with owner and resolution', c1.confirmed > 0 && c1.deviations >= 3, `"${bulkText.replace('Undo', '')}", deviations=${c1.deviations}, audit=${c1.audit}`);

// 4 Close browser, reopen
await ctx.close();
({ ctx, page } = await open(profile));
await page.waitForFunction(() => /Restored/.test(document.querySelector('.saved')?.textContent || ''), null, { timeout: 15000 });
const c2 = await counts(page);
step('Close browser and reopen: data still there (IndexedDB)', JSON.stringify(c1) === JSON.stringify(c2), `assessments=${c2.assessments} audit=${c2.audit} deviations=${c2.deviations}`);

// 5 JSON save, load in a second fresh browser
const [download] = await Promise.all([page.waitForEvent('download'), page.click('button[aria-label="Save session file (JSON)"]')]);
const jsonPath = resolve(dl, download.suggestedFilename()); await download.saveAs(jsonPath);
const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
const profile2 = mkdtempSync(resolve(tmpdir(), 'fg-acc-profile2-'));
const b2 = await open(profile2);
await b2.page.click('.side-nav > .side-nav-item:has-text("Workshop")');
await b2.page.setInputFiles('input[type=file][accept=".json"]', jsonPath);
await b2.page.click('button:has-text("Replace")');
await b2.page.waitForFunction(() => /Saved/.test(document.querySelector('.saved')?.textContent || ''), null, { timeout: 15000 });
const c3 = await counts(b2.page);
step('JSON save on laptop A, load on laptop B (fresh browser)', JSON.stringify(c1) === JSON.stringify(c3), `${download.suggestedFilename()} (${(readFileSync(jsonPath).length / 1024).toFixed(0)} KB), audit=${c3.audit}`);
await b2.ctx.close();

// 6 Deviation log export
await page.click('button:has-text("Files & exports")'); await page.waitForSelector('button:has-text("Deviation log")');
const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Deviation log")')]);
const xlsxPath = resolve(dl, dl2.suggestedFilename()); await dl2.saveAs(xlsxPath);
const buf = readFileSync(xlsxPath);
const zip = await JSZip.loadAsync(buf);
const wb = XLSX.read(buf, { type: 'buffer' });
const devRows = XLSX.utils.sheet_to_json(wb.Sheets['Deviation log']);
const decided = devRows.filter(r => r['Resolution approach'] === 'Separate variant' && r['Accountable owner']);
step('Deviation log .xlsx: valid package, 4 sheets, decided deviations carry owner / approach / session', zip.file('xl/workbook.xml') !== null && wb.SheetNames.length === 4 && decided.length >= 3, `${dl2.suggestedFilename()}: ${devRows.length} rows, ${decided.length} decided, sheets=${wb.SheetNames.join('/')}`);
const [dl3] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Flat export")')]);
const flatPath = resolve(dl, dl3.suggestedFilename()); await dl3.saveAs(flatPath);
const fwb = XLSX.read(readFileSync(flatPath), { type: 'buffer' });
step('Flat export .xlsx: one row per entity × activity + audit log', XLSX.utils.sheet_to_json(fwb.Sheets['Assessments']).length === c1.assessments && XLSX.utils.sheet_to_json(fwb.Sheets['Audit log']).length === c1.audit);
await ctx.close();
step('Zero network requests, zero console errors during the whole run', netAttempts === 0 && consoleErrors.length === 0, `network=${netAttempts} errors=${consoleErrors.length}${consoleErrors.length ? ' ' + consoleErrors[0] : ''}`);

const ok = results.every(r => r.ok);
const md = `# Acceptance test – pilot dry run

Run: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · build ${JSON.parse(readFileSync('package.json', 'utf8')).version} · headless Chromium, network blocked, file:// · ${((Date.now() - t0) / 1000).toFixed(0)} s
Result: **${ok ? 'PASSED' : 'FAILED'}** (${results.filter(r => r.ok).length}/${results.length})

| # | Step | Result | Detail |
|---|---|---|---|
${results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.ok ? 'pass' : 'FAIL'} | ${r.detail.replace(/\|/g, '/')} |`).join('\n')}

Data: generated demo workbooks (\`npm run demo\`), not client data.

## Manual checks still required before Monday 13:00
- Open the deviation log and the flat export in Excel on the corporate laptop: no repair prompt expected (the package is a standard SheetJS xlsx; validated here by re-reading it with SheetJS and JSZip only).
- Open \`dist/index.html\` on the corporate laptop with Wi-Fi off in Edge: welcome dialog, fonts rendered (serif page title), import of the real capture sheets.
- Run \`npm run inspect -- <folder with the real files>\` and compare blocks / entities / field mapping with the capture sheets.

Re-run: \`npm run build && node scripts/acceptance.mjs\`.
`;
mkdirSync('docs', { recursive: true }); writeFileSync('docs/ACCEPTANCE.md', md);
console.log(`\n${ok ? 'ACCEPTANCE PASSED' : 'ACCEPTANCE FAILED'} – docs/ACCEPTANCE.md written`);
process.exit(ok ? 0 : 1);
