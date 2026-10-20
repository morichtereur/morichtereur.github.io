#!/usr/bin/env node
// Offline smoke test of dist/index.html in headless Chromium (Playwright):
// zero network, demo import, summary, persistence across reload, JSON export,
// navigation, screenshots → dist/screenshots/.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(here, '..');
let pw;
try { pw = createRequire(import.meta.url)('playwright'); }
catch (e) { const g = execSync('npm root -g').toString().trim(); pw = createRequire(path.join(g, '/'))('playwright'); }
const { chromium } = pw;

const url = 'file://' + path.join(rootDir, 'dist/index.html');
const shots = path.join(rootDir, 'dist/screenshots'); fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [], network = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.route('**/*', route => { const u = route.request().url(); if (u.startsWith('file://')) return route.continue(); network.push(u); route.abort(); });
await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', e => { (window.__csp = window.__csp || []).push(e.blockedURI + ' ' + e.violatedDirective); }); });
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
const ok = (m) => console.log('ok  ', m);

await page.goto(url);
await page.waitForFunction(() => window.FG_READY === true, null, { timeout: 15000 });
ok('app booted offline');
const fontsOk = await page.evaluate(() => document.fonts.check('16px "Instrument Sans"') && document.fonts.check('16px "Source Serif 4"') && document.fonts.check('16px "IBM Plex Mono"'));
fontsOk ? ok('embedded fonts available') : fail('fonts not loaded');
await page.waitForSelector('dialog.dlg[open]');
ok('welcome dialog shown on first start');
await page.screenshot({ path: path.join(shots, '01-welcome.png') });
await page.fill('dialog.dlg input.input >> nth=0', 'Demo Group');
await page.fill('dialog.dlg input.input >> nth=1', 'France');
await page.fill('dialog.dlg input.input >> nth=2', 'MR');
await page.click('dialog.dlg button.link:has-text("Try with demo data")');
await page.waitForFunction(() => document.querySelectorAll('.filerow.done').length === 6 && !document.querySelector('.filerow:not(.done)'), null, { timeout: 60000 });
ok('6 demo files imported');
const kpis = await page.$$eval('.kpis .kpi', els => els.map(e => e.querySelector('.l').textContent + '=' + e.querySelector('.v').textContent.trim()));
console.log('     ', kpis.join(' | '));
const files = await page.$eval('.kpis .kpi:nth-child(1) .v', e => parseInt(e.textContent, 10));
files === 6 ? ok('summary: 6 files') : fail('summary files = ' + files);
const strip = await page.$eval('.strip .kpi-head', e => e.textContent);
console.log('      strip:', strip.trim());
(await page.$$('.table tbody tr')).length > 5 ? ok('summary tables rendered') : fail('summary tables missing');
await page.click('.card:has(h2:text("Files and detected structure")) tr.clickable >> nth=0'); // expand a file's detected structure
await page.evaluate(() => document.querySelector('.content').scrollTop = 0);
await page.screenshot({ path: path.join(shots, '02-import-summary.png') });
await page.evaluate(() => document.querySelector('.content').scrollTop = 900);
await page.screenshot({ path: path.join(shots, '02b-import-structure.png') });
// sidebar streams
const streams = await page.$$eval('.side-stream .k', els => els.map(e => e.textContent));
console.log('      streams:', streams.join(', '));
streams.join(',') === 'R2R,A2R-FAA,A2R-IA,I2P,I2C,ICO' ? ok('6 streams / sub-streams in sidebar, in order') : fail('streams: ' + streams.join(','));
// persistence
await page.waitForFunction(() => document.querySelector('.savestate.saved'), null, { timeout: 10000 }).then(() => ok('autosaved to IndexedDB'), () => fail('autosave did not reach "saved"'));
await page.reload();
await page.waitForFunction(() => window.FG_READY === true, null, { timeout: 15000 });
const persisted = await page.evaluate(() => FG.ui.state.session.files.length);
persisted === 6 ? ok('session persisted across reload (' + persisted + ' files)') : fail('persisted files = ' + persisted);
(await page.$('dialog.dlg[open]')) ? fail('welcome dialog shown again after reload') : ok('no welcome dialog after reload');
// JSON export
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.topbar button[title^="Save session"]')]);
const dlPath = await dl.path(); const json = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
json.kind === 'fitgap-workbench-session' && Object.keys(json.assessments).length > 1000 ? ok('JSON export: ' + dl.suggestedFilename() + ' · ' + Object.keys(json.assessments).length + ' assessments') : fail('JSON export broken');
// run view + palette
await page.click('.side-stream >> nth=0');
await page.waitForSelector('.tree .node');
(await page.$$('.tree .node')).length > 3 ? ok('run browser: tree rendered') : fail('tree empty');
await page.click('.table tbody tr.clickable >> nth=0');
await page.waitForSelector('.detail');
ok('run browser: detail panel');
await page.screenshot({ path: path.join(shots, '03-run-browser.png') });
await page.keyboard.press('Control+K');
await page.waitForSelector('.cmdk input');
await page.fill('.cmdk input', 'I2C 1.1.1');
await page.waitForSelector('.cmdk li');
await page.keyboard.press('Enter');
await page.waitForFunction(() => FG.ui.state.view === 'run' && FG.ui.state.params.pid === 'I2C 1.1.1' && FG.ui.state.params.stream === 'I2C' && FG.ui.state.params.l3 === 'I2C 1.1.1');
ok('command palette jumps to process');
// feedback
await page.click('.topbar button:has-text("Feedback")');
await page.fill('.popover textarea', 'Smoke test feedback');
await page.click('.popover button:has-text("Log feedback")');
await page.waitForFunction(() => FG.ui.state.session.feedback.length === 1);
ok('feedback logged');
// settings + dark mode + style sheet
await page.click('.side-foot button[title="Settings"]');
await page.waitForSelector('.page-head h1:has-text("Settings")');
await page.click('.topbar button[title^="Toggle light"]');
await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
await page.click('.side-foot button[title="Style sheet"]');
await page.waitForSelector('.swatches');
await page.screenshot({ path: path.join(shots, '04-stylesheet-dark.png'), fullPage: true });
await page.click('.topbar button[title^="Toggle light"]');
await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
await page.screenshot({ path: path.join(shots, '05-stylesheet-light.png'), fullPage: true });
// re-import same file: no diffs, version 2
await page.click('.side-item:has(.lbl:text-is("Prepare"))');
await page.waitForSelector('.dropzone');
await page.evaluate(() => { FG.ui.state.importQueue = []; });
await page.evaluate(() => { const XLSX = window.XLSX; const f = FG.demo.buildWorkbooks(XLSX)[0]; const out = XLSX.write(f.wb, { type: 'array', bookType: 'xlsx' }); FG.ui.addFiles([new File([out], f.name)]); });
await page.waitForFunction(() => document.querySelectorAll('.filerow.done').length === 1, null, { timeout: 30000 });
const v2 = await page.evaluate(() => ({ v: FG.ui.state.session.files.find(f => f.name === 'Demo_FitGap_R2R.xlsx').version, diffs: FG.ui.state.session.pendingDiffs.length, n: FG.ui.state.session.files.length }));
v2.v === 2 && v2.diffs === 0 && v2.n === 6 ? ok('re-import: version 2, no duplicates, no diffs') : fail('re-import ' + JSON.stringify(v2));
// results
const cspV = await page.evaluate(() => window.__csp || []);
network.length === 0 ? ok('zero network requests') : fail('network requests attempted: ' + network.join(', '));
cspV.length === 0 ? ok('no CSP violations') : fail('CSP violations: ' + cspV.join(', '));
errors.length === 0 ? ok('no console errors') : fail('console errors: ' + errors.join(' | '));
await browser.close();
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
