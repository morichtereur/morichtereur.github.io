#!/usr/bin/env node
// Assembles src/ + vendor libraries + fonts into ONE self-contained dist/index.html.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(here, '..');
const read = (p) => fs.readFileSync(path.join(rootDir, p), 'utf8');

const VENDOR = [
  { name: 'SheetJS (xlsx) 0.18.5 – Apache-2.0', file: 'node_modules/xlsx/dist/xlsx.full.min.js' },
  { name: 'JSZip 3.10.1 – MIT/GPLv3 dual', file: 'node_modules/jszip/dist/jszip.min.js' },
];
const FONTS = [
  { family: 'Instrument Sans', file: 'fonts/InstrumentSans-latin.woff2', weight: '400 700' },
  { family: 'Source Serif 4', file: 'fonts/SourceSerif4-latin.woff2', weight: '400 700' },
  { family: 'IBM Plex Mono', file: 'fonts/IBMPlexMono-400-latin.woff2', weight: '400' },
  { family: 'IBM Plex Mono', file: 'fonts/IBMPlexMono-500-latin.woff2', weight: '500' },
];

let html = read('src/index.html');
const fontsCss = '/* Fonts embedded as base64 woff2 (latin subsets). Instrument Sans, Source Serif 4, IBM Plex Mono – SIL Open Font License 1.1. */\n' +
  FONTS.map(f => { const b64 = fs.readFileSync(path.join(rootDir, f.file)).toString('base64'); return `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`; }).join('\n');
html = html.replace('/* @fonts */', () => fontsCss);
html = html.replace('/* @css */', () => read('src/styles.css'));
const vendor = VENDOR.map(v => { const src = read(v.file); if (!/^\/\*!/.test(src.trimStart())) throw new Error('licence header missing in ' + v.file); return `<script>/* ${v.name} */\n${src}\n</script>`; }).join('\n');
html = html.replace('<!-- @vendor -->', () => vendor);
const appFiles = fs.readdirSync(path.join(rootDir, 'src/js')).filter(f => f.endsWith('.js')).sort();
const app = appFiles.map(f => `<script>\n${read('src/js/' + f)}\n</script>`).join('\n');
html = html.replace('<!-- @app -->', () => app);
let sha = 'local'; try { sha = execSync('git rev-parse --short HEAD', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { /* no git */ }
const stamp = new Date().toISOString().slice(0, 10) + ' ' + sha;
html = html.replace('/* @build */', () => stamp);
if (/<\/script>/.test(appFiles.map(f => read('src/js/' + f)).join(''))) throw new Error('"</script>" inside app source would break inlining');
fs.mkdirSync(path.join(rootDir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(rootDir, 'dist/index.html'), html);
const size = fs.statSync(path.join(rootDir, 'dist/index.html')).size;
console.log(`dist/index.html  ${(size / 1024 / 1024).toFixed(2)} MB  build ${stamp}  (${appFiles.length} app modules, ${VENDOR.length} vendor libs, ${FONTS.length} fonts)`);
// Sanity: no external URLs in src/href attributes
const ext = html.match(/(src|href)=["']https?:\/\/[^"']+/g);
if (ext) { console.error('External references found:', ext); process.exit(1); }
