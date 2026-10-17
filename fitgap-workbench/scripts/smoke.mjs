#!/usr/bin/env node
// Offline smoke test: open dist/index.html over file:// in headless Chromium with
// every network request blocked, fail on console errors or any network attempt,
// and save screenshots (light, dark, style sheet). Usage: node scripts/smoke.mjs [outDir]
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const out = resolve(process.argv[2] || 'dist/smoke'); mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], requests = [];
await ctx.route('**/*', (route) => { const u = route.request().url(); if (!u.startsWith('file://')) { requests.push(u); return route.abort(); } return route.continue(); });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + resolve('dist/index.html'));
await page.waitForSelector('.sidebar');
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${out}/01-welcome.png` });
await page.click('dialog .btn-primary');
await page.waitForSelector('.sg-section');
await page.screenshot({ path: `${out}/02-styleguide-light.png`, fullPage: true });
await page.click('button[aria-label="Toggle theme"]');
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/03-styleguide-dark.png`, fullPage: true });
await page.click('button[aria-label="Toggle theme"]');
await page.click('.side-nav-item:nth-child(3)');
await page.screenshot({ path: `${out}/04-run-coming-next.png` });
await page.keyboard.press('Control+K');
await page.waitForSelector('dialog.palette[open]');
await page.keyboard.type('qg2');
await page.screenshot({ path: `${out}/05-palette.png` });
await page.keyboard.press('Escape');
const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight));
const fontsUsed = await page.evaluate(() => ({ h1: getComputedStyle(document.querySelector('h1')).fontFamily, body: getComputedStyle(document.body).fontFamily }));
await browser.close();
console.log('fonts loaded:', [...new Set(fonts)].join(' | '));
console.log('h1 font:', fontsUsed.h1, '| body:', fontsUsed.body);
console.log('network attempts:', requests.length, requests.slice(0, 5));
console.log('console errors:', errors.length, errors.slice(0, 5));
console.log('screenshots in', out);
if (errors.length || requests.length) process.exit(1);
