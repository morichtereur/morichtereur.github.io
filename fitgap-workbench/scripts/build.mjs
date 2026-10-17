#!/usr/bin/env node
// Assembles src/ into one self-contained dist/index.html: CSS, fonts (base64
// woff2), pinned libraries (licence headers kept) and the app modules (ES
// modules stripped of import/export and concatenated in dependency order).
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => resolve(root, p);
const read = (p) => readFileSync(r(p), 'utf8');

const LIBS = [
  { name: 'SheetJS (xlsx) 0.18.5', path: 'node_modules/xlsx/dist/xlsx.core.min.js', licence: 'Apache-2.0' },
  { name: 'JSZip 3.10.1', path: 'node_modules/jszip/dist/jszip.min.js', licence: 'MIT' },
  { name: 'Preact 10.29.8 + hooks + htm 3.1.1 (htm/preact/standalone)', path: 'node_modules/htm/preact/standalone.umd.js', licence: 'MIT' },
];
const FONTS = [
  { family: 'Instrument Sans Variable', weight: '400 700', style: 'normal', path: 'node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2', range: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
  { family: 'Instrument Sans Variable', weight: '400 700', style: 'normal', path: 'node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-ext-wght-normal.woff2', range: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' },
  { family: 'Source Serif 4 Variable', weight: '200 900', style: 'normal', path: 'node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2' },
  { family: 'IBM Plex Mono', weight: '400', style: 'normal', path: 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2' },
  { family: 'IBM Plex Mono', weight: '500', style: 'normal', path: 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2' },
];
const CSS = ['src/styles/tokens.css', 'src/styles/base.css', 'src/styles/components.css'];
// Dependency order matters: later modules may use names declared earlier.
const MODULES = [
  'src/model/constants.js', 'src/model/normalize.js', 'src/parser/profiles.js', 'src/parser/capture.js', 'src/parser/flows.js',
  'src/model/session.js', 'src/model/workshop.js', 'src/model/analysis.js', 'src/model/exports.js', 'src/model/writeback.js', 'src/parser/planning.js', 'src/model/demo.js', 'src/model/storage.js',
  'src/ui/icons.js', 'src/ui/components.js', 'src/ui/exports.js', 'src/ui/flows.js', 'src/ui/swimlane.js', 'src/ui/flowboard.js', 'src/ui/present.js', 'src/ui/styleguide.js',
  'src/ui/profiles.js', 'src/ui/import.js', 'src/ui/plan.js', 'src/ui/workshop.js', 'src/ui/evaluate.js', 'src/ui/qg2.js', 'src/ui/prepare.js', 'src/ui/handover.js', 'src/ui/home.js', 'src/ui/app.js',
];

const FONT_LICENCES = `/* Fonts embedded under the SIL Open Font License 1.1: Instrument Sans (Rodrigo Fuenzalida, Jordan Egstad), Source Serif 4 (Adobe), IBM Plex Mono (IBM). */`;

function fontFaces() {
  return FONT_LICENCES + '\n' + FONTS.map(f => {
    const b64 = readFileSync(r(f.path)).toString('base64');
    const range = f.range ? `\n  unicode-range: ${f.range};` : '';
    return `@font-face {\n  font-family: '${f.family}';\n  font-style: ${f.style};\n  font-weight: ${f.weight};\n  font-display: swap;\n  src: url(data:font/woff2;base64,${b64}) format('woff2-variations');${range}\n}`;
  }).join('\n');
}

function stripModule(src, name) {
  let out = src.replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '');
  out = out.replace(/^export\s+default\s+/gm, '');
  out = out.replace(/^export\s+(?=(const|let|var|function|async|class)\b)/gm, '');
  if (/^\s*(import|export)\b/m.test(out)) throw new Error(`Unhandled import/export left in ${name}`);
  return `\n/* ---- ${name} ---- */\n${out}`;
}

function checkDuplicates(sources) {
  const seen = new Map();
  for (const [name, src] of sources) {
    for (const m of src.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (seen.has(m[1])) throw new Error(`Top-level name "${m[1]}" declared in both ${seen.get(m[1])} and ${name}`);
      seen.set(m[1], name);
    }
  }
}

const template = read('src/index.html');
const css = CSS.map(p => `/* ${p} */\n${read(p)}`).join('\n');
const libs = LIBS.map(l => `\n/* ===== ${l.name} – ${l.licence} ===== */\n${read(l.path)}`).join('\n');
const moduleSources = MODULES.map(p => [p, stripModule(read(p), p)]);
checkDuplicates(moduleSources);
const app = moduleSources.map(([, s]) => s).join('\n');
const version = JSON.parse(read('package.json')).version;
const built = new Date().toISOString();

// Function replacers: library sources contain "$&" / "$'" sequences that a
// string replacement would expand.
const fontsBlock = `<style id="fonts">\n${fontFaces()}\n</style>`;
const cssBlock = `<style id="app-css">\n${css}\n</style>`;
const libsBlock = `<script id="libs">${libs}\n</script>`;
const appBlock = `<script id="app">\n'use strict';\nconst BUILD = { version: '${version}', builtAt: '${built}' };\n${app}\n</script>`;
let html = template
  .replace('<!-- @inline:fonts -->', () => fontsBlock)
  .replace('<!-- @inline:css -->', () => cssBlock)
  .replace('<!-- @inline:libs -->', () => libsBlock)
  .replace('<!-- @inline:app -->', () => appBlock)
  .replace(/@version@/g, () => version);
if (/<!-- @inline:/.test(html)) throw new Error('Template placeholder left unreplaced');
if (/(src|href)=["']https?:\/\//.test(html)) throw new Error('External URL found in output – runtime must make zero network requests');

mkdirSync(r('dist'), { recursive: true });
writeFileSync(r('dist/index.html'), html);
const size = statSync(r('dist/index.html')).size;
console.log(`dist/index.html  ${(size / 1024).toFixed(0)} KB  (v${version}, ${built})`);
