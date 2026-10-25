// Cases first seen in real single-entity country files (anonymised here with the demo workbooks):
// files without entity label, duplicate activity IDs, empty Process Level, sheets whose range runs to row 1,048,576.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import { parseCaptureWorkbook, sheetToGrid } from '../src/parser/capture.js';
import { createSession, mergeParsedWorkbook, countryFromFileName, clientNameFromEntities, sessionCountries } from '../src/model/session.js';

let dir, files;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'fitgap-se-'));
  execFileSync(process.execPath, ['scripts/generate-demo.mjs', dir], { stdio: 'ignore' });
  files = readdirSync(dir).filter(f => f.endsWith('.xlsx'));
});
const parse = (f, mutate) => { const wb = XLSX.read(readFileSync(join(dir, f)), { type: 'buffer' }); if (mutate) mutate(wb); return parseCaptureWorkbook(wb, { XLSX, fileName: f }); };
// One entity of a demo file, re-labelled as a single-entity file without label (or kept labelled), renamed to a KR file.
function asCountryFile(parsed, entityCode, fileName, unlabeled) {
  const e = parsed.entities.find(x => x.code === entityCode);
  return { ...parsed, fileName, entities: [unlabeled ? { code: 'unlabeled', name: '', raw: '', hasCode: false, unlabeled: true } : e],
    assessments: parsed.assessments.filter(a => a.entityCode === entityCode).map(a => ({ ...a, entityCode: unlabeled ? 'unlabeled' : a.entityCode, sources: a.sources.map(s => ({ ...s, file: fileName })) })) };
}

test('country from ISO codes and names at the end of the file name', () => {
  assert.equal(countryFromFileName('202609_GBS_Evolution_Fit-Gap_Assessment__R2R_KR.xlsx'), 'Korea');
  assert.equal(countryFromFileName('Capture_A2R_France.xlsx'), 'France');
  assert.equal(countryFromFileName('Capture_A2R_MD.xlsx'), '');
  assert.equal(clientNameFromEntities(['Alpha Pharma Korea']), 'Alpha');
});

test('files without entity label join the country entity – in either import order', () => {
  const r2r = parse(files.find(f => /R2R/.test(f))), a2r = parse(files.find(f => /A2R/.test(f)));
  const code = a2r.entities.find(e => e.hasCode).code;
  for (const order of ['unlabelled first', 'labelled first']) {
    const s = createSession();
    const steps = [asCountryFile(r2r, code, 'Cap_R2R_KR.xlsx', true), asCountryFile(a2r, code, 'Cap_A2R_KR.xlsx', false)];
    if (order === 'labelled first') steps.reverse();
    for (const p of steps) mergeParsedWorkbook(s, p);
    assert.deepEqual(Object.keys(s.entities), [code], order);
    assert.equal(s.entities[code].country, 'Korea');
    const streams = new Set(Object.values(s.assessments).map(a => a.stream));
    assert.ok(streams.has('R2R') && streams.has('A2R'), `${order}: both streams under ${code}`);
    assert.ok(Object.values(s.assessments).every(a => a.entityCode === code && a.key.startsWith(`${code}::`)), order);
    assert.ok(!s.settings.clientName.includes('no entity label'), 'placeholder never becomes the client name');
  }
});

test('duplicate activity IDs are kept as separate activities; an empty level is taken from the ID', () => {
  const f = files.find(f => /R2R/.test(f)); const base = parse(f);
  const acts = base.processes.filter(p => p.level === 4); const [a, b] = [acts[0], acts[3]]; const col = base.layout.core.id.col, lcol = base.layout.core.level.col;
  const p = parse(f, wb => { const ws = wb.Sheets[base.sheetName]; ws[XLSX.utils.encode_cell({ r: b.row - 1, c: col })].v = a.id; const lv = ws[XLSX.utils.encode_cell({ r: acts[1].row - 1, c: lcol })]; lv.v = ''; lv.t = 's'; });
  assert.ok(p.processes.some(x => x.id === `${a.id} (2)` && x.name === b.name), 'second occurrence kept as "<id> (2)"');
  assert.equal(p.assessments.length, base.assessments.length, 'no activity lost');
  assert.ok(p.warnings.some(w => w.code === 'DUPLICATE_ID'));
  assert.ok(p.processes.some(x => x.id === acts[1].id && x.level === 4), 'row without level still imported');
  assert.ok(p.warnings.some(w => w.code === 'LEVEL_INFERRED'));
});

test('a sheet range stretched to row 1,048,576 is read only up to the last filled cell', () => {
  const ws = XLSX.utils.aoa_to_sheet([['Process Level', 'Process ID'], [4, 'R2R 1.1.1.1']]);
  ws['!ref'] = 'A1:BA1048576';
  const t = Date.now(); const g = sheetToGrid(ws, XLSX);
  assert.equal(g.rows.length, 2); assert.ok(Date.now() - t < 500);
});

test('an entity label without code is recognised by its position above the block', () => {
  const f = files.find(f => /R2R/.test(f)); const base = parse(f);
  const second = base.layout.blocks.filter(b => b.kind === 'ASIS')[1];
  const p = parse(f, wb => { const ws = wb.Sheets[base.sheetName]; for (const b of base.layout.blocks) if (b.labelCell && b.entity?.code === second.entity.code) ws[b.labelCell].v = 'AP Hub'; });
  assert.ok(p.entities.some(e => e.name === 'AP Hub'), 'second entity kept, not merged into its neighbour');
  assert.equal(p.entities.length, base.entities.length);
  assert.equal(p.assessments.length, base.assessments.length);
  assert.ok(p.warnings.some(w => w.code === 'ENTITY_BY_POSITION'));
});

test('pre-assessment check: summary per entity × stream and one finding per empty GAP cell', async () => {
  const { preAssessmentQC } = await import('../src/model/qc.js');
  const f = files.find(f => /R2R/.test(f)); const base = parse(f);
  const victim = base.assessments.find(a => !a.scope.outOfScope && a.asIs.gap && a.sources[0].cells.asIs?.gap);
  const p = parse(f, wb => { const c = wb.Sheets[base.sheetName][victim.sources[0].cells.asIs.gap]; c.v = ''; c.t = 's'; });
  const s = createSession(); mergeParsedWorkbook(s, p);
  const qc = preAssessmentQC(s);
  assert.equal(qc.summary.length, p.entities.length, 'one row per entity for the stream');
  const hit = qc.issues.find(i => i.code === 'GAP_MISSING' && i.processId === victim.processId);
  assert.ok(hit, 'empty GAP reported'); assert.equal(hit.cell, victim.sources[0].cells.asIs.gap);
  assert.ok(qc.summary.every(r => ['Green', 'Amber', 'Red', 'n/a'].includes(r.readiness)));
});

test('a second country in the same browser: unlabelled files still find their entity (older sessions without stored country)', () => {
  const r2r = parse(files.find(f => /R2R/.test(f))), a2r = parse(files.find(f => /A2R/.test(f)));
  const s = createSession();
  mergeParsedWorkbook(s, { ...a2r, fileName: 'Cap_A2R_France.xlsx', assessments: a2r.assessments.map(a => ({ ...a, sources: a.sources.map(x => ({ ...x, file: 'Cap_A2R_France.xlsx' })) })) });
  for (const e of Object.values(s.entities)) delete e.country; // as saved by earlier versions
  const code = a2r.entities.find(e => e.hasCode).code, kr = (p, f, unl) => { const c = asCountryFile(p, code, f, unl); return unl ? c : { ...c, entities: [{ ...c.entities[0], code: '999999' }], assessments: c.assessments.map(a => ({ ...a, entityCode: '999999' })) }; };
  mergeParsedWorkbook(s, kr(r2r, 'Cap_R2R_SG.xlsx', true)); mergeParsedWorkbook(s, kr(a2r, 'Cap_A2R_SG.xlsx', false));
  assert.ok(!Object.keys(s.entities).some(c => c.startsWith('unlabeled:')), 'no "(no entity label)" entity left');
  assert.ok(Object.values(s.assessments).some(a => a.entityCode === '999999' && a.stream === 'R2R'), 'R2R joined the Singapore entity');
  assert.deepEqual(sessionCountries(s).sort(), ['France', 'Singapore']);
});
