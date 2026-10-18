#!/usr/bin/env node
// Zips the project for Replit (sources, scripts, tests, docs, built dist) – no
// node_modules, no sample workbooks. Usage: node scripts/package-replit.mjs [out.zip]
import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
const root = resolve('.'); const out = resolve(process.argv[2] || 'gbs-fitgap-workbench-replit.zip');
const SKIP = [/^node_modules(\/|$)/, /^samples\/(?!README\.md$)/, /^dist\/smoke(\/|$)/, /^dist\/video(\/|$)/, /\.zip$/, /^\.git(\/|$)/];
const zip = new JSZip(); let n = 0;
function walk(dir) { for (const e of readdirSync(dir)) { const p = join(dir, e); const rel = relative(root, p).split('\\').join('/'); if (SKIP.some(rx => rx.test(rel))) continue; if (statSync(p).isDirectory()) walk(p); else { zip.file(`gbs-fitgap-workbench/${rel}`, readFileSync(p)); n++; } } }
walk(root);
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`${out}: ${n} files, ${(statSync(out).size / 1024).toFixed(0)} KB`);
