import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { parseCaptureWorkbook, sheetToGrid } from '../src/parser/capture.js';
import { createSession, mergeParsedWorkbook } from '../src/model/session.js';
import { extractFlows, flowLabels, matchLabel } from '../src/parser/flows.js';

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), 'fitgap-flows-')); execFileSync(process.execPath, ['scripts/generate-demo.mjs', dir], { stdio: 'ignore' }); });

test('flow labels: "R2R 2.1.1 + name" and "01 l name" forms', () => {
  const grid = { rows: [[null, 'R2R 1.1', 'Journal Entries'], ['01 l Account Reconciliations'], ['some prose that is not a label']] };
  const l = flowLabels(grid);
  assert.deepEqual(l.map(x => [x.id, x.name]), [['R2R 1.1', 'Journal Entries'], [null, 'Account Reconciliations']]);
});

test('images are extracted from the demo R2R / A2R workbooks and mapped to a node', async () => {
  const s = createSession();
  for (const f of readdirSync(dir)) mergeParsedWorkbook(s, parseCaptureWorkbook(XLSX.read(readFileSync(join(dir, f)), { type: 'buffer' }), { XLSX, fileName: f }));
  let total = 0;
  for (const f of readdirSync(dir).filter(x => /R2R|A2R/.test(x))) {
    const buf = readFileSync(join(dir, f));
    const wb = XLSX.read(buf, { type: 'buffer' });
    const zip = await JSZip.loadAsync(buf);
    const flowSheets = wb.SheetNames.filter(n => /^Process Flows_/.test(n));
    const grids = Object.fromEntries(flowSheets.map(n => [n, sheetToGrid(wb.Sheets[n], XLSX)]));
    const flows = await extractFlows(zip, flowSheets, grids, s.processes, { stream: f.includes('R2R') ? 'R2R' : 'A2R', fileName: f });
    assert.equal(flows.length, 1, `${f}: one image`);
    assert.ok(flows[0].dataUrl.startsWith('data:image/png;base64,'));
    assert.ok(flows[0].nodeId, `${f}: mapped to ${flows[0].label}`);
    assert.equal(flows[0].score, 1);
    total += flows.length;
  }
  assert.equal(total, 2);
  assert.equal(matchLabel({ id: null, name: 'Journal Entry' }, s.processes, 'R2R')?.nodeId, 'R2R 1.1');
});
