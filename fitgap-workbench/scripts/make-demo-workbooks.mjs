#!/usr/bin/env node
// Writes the six demo capture-sheet workbooks to the given directory (default samples/demo).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
globalThis.XLSX = XLSX;
const here = path.dirname(fileURLToPath(import.meta.url));
for (const m of ['00-util.js', '10-profile.js', '15-demo.js']) require(path.join(here, '..', 'src', 'js', m));
const outDir = path.resolve(process.argv[2] || path.join(here, '..', 'samples', 'demo'));
fs.mkdirSync(outDir, { recursive: true });
for (const f of globalThis.FG.demo.buildWorkbooks(XLSX)) {
  const p = path.join(outDir, f.name);
  XLSX.writeFile(f.wb, p);
  console.log('wrote', path.relative(process.cwd(), p));
}
