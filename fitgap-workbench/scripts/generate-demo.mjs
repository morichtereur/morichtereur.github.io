#!/usr/bin/env node
// Writes the demo workbooks to a folder. Usage: node scripts/generate-demo.mjs [out=samples/demo]
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateDemoWorkbooks } from '../src/model/demo.js';
const OUT = resolve(process.argv[2] || 'samples/demo');
mkdirSync(OUT, { recursive: true });
for (const f of await generateDemoWorkbooks(XLSX, JSZip)) { const file = resolve(OUT, f.name); writeFileSync(file, f.data); console.log('wrote', file); }
