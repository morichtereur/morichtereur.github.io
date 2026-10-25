#!/usr/bin/env node
// Pre-assessment quality check for one country's capture workbooks, before the fit-gap workshop.
// Usage: node scripts/qc-preassessment.mjs <country-folder> [--reference <folder> ...] [--out <file.xlsx>]
// --reference: other countries' workbooks (same template) – entity codes used twice, rows missing or added.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { parseCaptureWorkbook } from '../src/parser/capture.js';
import { createSession, mergeParsedWorkbook } from '../src/model/session.js';
import { preAssessmentQC, qcWorkbookBytes } from '../src/model/qc.js';

const args = process.argv.slice(2); const refs = []; let out = null; let folder = null;
for (let i = 0; i < args.length; i++) { if (args[i] === '--reference') refs.push(args[++i]); else if (args[i] === '--out') out = args[++i]; else folder = args[i]; }
if (!folder) { console.error('usage: node scripts/qc-preassessment.mjs <country-folder> [--reference <folder> ...] [--out <file.xlsx>]'); process.exit(1); }

const load = (dir) => { const s = createSession(); for (const f of readdirSync(dir).filter(x => /\.xlsx$/i.test(x)).sort()) mergeParsedWorkbook(s, parseCaptureWorkbook(XLSX.read(readFileSync(resolve(dir, f)), { type: 'buffer' }), { XLSX, fileName: f })); return s; };
const session = load(resolve(folder));
let reference = null;
if (refs.length) {
  reference = { name: '', entityCodes: new Set(), processIds: new Map(), names: new Map() }; const names = [];
  for (const r of refs) {
    const s = load(resolve(r)); names.push(s.settings.country || basename(r));
    for (const e of Object.values(s.entities)) if (e.hasCode) reference.entityCodes.add(e.code);
    for (const p of Object.values(s.processes)) { if (p.level < 4 || / \(\d+\)$/.test(p.id)) continue; if (!reference.processIds.has(p.stream)) reference.processIds.set(p.stream, new Set()); reference.processIds.get(p.stream).add(p.id); reference.names.set(p.id, p.name); }
  }
  reference.name = names.join(' / ');
}
const qc = preAssessmentQC(session, { reference });
const file = resolve(out || `${(session.settings.country || 'country').replace(/\W+/g, '_')}_pre-assessment_QC.xlsx`);
writeFileSync(file, await qcWorkbookBytes(session, XLSX, JSZip, qc));
console.log(`${session.settings.clientName} · ${session.settings.country} · ${Object.keys(session.entities).length} entities · ${Object.keys(session.assessments).length} assessments`);
for (const s of qc.summary) console.log(`  ${s.readiness.padEnd(5)} ${s.entity.slice(0, 30).padEnd(30)} ${s.stream.padEnd(4)} in scope ${String(s.inScope).padStart(4)} · GAP ${String(s.gapPct).padStart(3)}% · split ${String(s.splitPct).padStart(3)}% · system ${String(s.systemPct).padStart(3)}% · gaps explained ${String(s.gapsExplainedPct).padStart(3)}% · H${s.high} M${s.medium} L${s.low}`);
const byCheck = {}; for (const i of qc.issues) byCheck[`${i.severity} · ${i.check}`] = (byCheck[`${i.severity} · ${i.check}`] || 0) + 1;
console.log(`findings: ${qc.totals.high} high · ${qc.totals.medium} medium · ${qc.totals.low} low · ${qc.totals.info} info`);
for (const [k, n] of Object.entries(byCheck)) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log('report:', file);
