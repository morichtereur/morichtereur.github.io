import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { extractDates, extractTimeRanges, streamFromProcessName, parsePlanningWorkbook } from '../src/parser/planning.js';

test('dates: dd.mm.yyyy lists, textual months, serials', () => {
  assert.deepEqual(extractDates('19.10.2026 and 20.10.2026'), ['2026-10-19', '2026-10-20']);
  assert.deepEqual(extractDates('Monday 19 Oct 2026'), ['2026-10-19']);
  assert.deepEqual(extractDates('Oct 21, 2026 (tbc)'), ['2026-10-21']);
  assert.deepEqual(extractDates(46314), ['2026-10-19']);
  assert.deepEqual(extractDates('tbd'), []);
});

test('times: ranges with dots, colons, am/pm, time zones', () => {
  assert.deepEqual(extractTimeRanges('Monday from 10:00-12:00 and 13:00-16:00').map(t => `${t.start}-${t.end}`), ['10:00-12:00', '13:00-16:00']);
  assert.deepEqual(extractTimeRanges('9:00-11:00 CET')[0], { start: '09:00', end: '11:00', tz: 'CET' });
  assert.deepEqual(extractTimeRanges('9.30 – 11.30 KST')[0], { start: '09:30', end: '11:30', tz: 'KST' });
  assert.deepEqual(extractTimeRanges('2-4 pm')[0].start, '14:00');
  assert.deepEqual(extractTimeRanges('all day'), []);
});

test('process names map to streams', () => {
  assert.equal(streamFromProcessName('Record-to-Report'), 'R2R');
  assert.equal(streamFromProcessName('Invoice-to-Pay'), 'I2P');
  assert.equal(streamFromProcessName('Order-to-Cash'), 'I2C');
  assert.equal(streamFromProcessName('Acquire-to-Retire (FAA)'), 'A2R');
  assert.equal(streamFromProcessName('Master Data'), 'MD');
  assert.equal(streamFromProcessName('Travel-and-Expense'), 'I2P T&E');
  assert.equal(streamFromProcessName('Intercompany'), 'ICO');
  assert.equal(streamFromProcessName('Payroll'), null);
});

test('planning workbook: "New" sheet, several countries, best-effort sessions with review flags', () => {
  const aoa = [['Fit Gap Workshops'], [], ['Country', 'PROCESS', 'Responsible', 'Comment', 'Workshop Date', 'Meeting time', 'Overall Duration', 'Status'],
    ['France', 'Record-to-Report', 'A. Expert', '', '19.10.2026 and 20.10.2026', 'Monday from 10:00-12:00 and 13:00-16:00', '5h', 'confirmed with PE and RO'],
    [null, 'Invoice-to-Pay', 'B. Expert', 'tbc', '21.10.2026', '9:00-11:00 CET', '2h', 'invite sent'],
    ['UK&I', 'Order-to-Cash', 'C. Expert', '', 'tbd', 'tbd', '', ''],
    ['KR', 'Master Data', 'D. Expert', '', '22.10.2026', '9:00-11:00 KST', '2h', '']];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['old']]), 'Old');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'New');
  const p = parsePlanningWorkbook(wb, { XLSX, fileName: 'plan.xlsx' });
  assert.equal(p.ok, true); assert.equal(p.sheetName, 'New');
  assert.deepEqual(p.countries, ['France', 'UK&I', 'KR']);
  assert.equal(p.rows[1].country, 'France', 'country carried down');
  const fr = p.sessions.filter(s => s.country === 'France');
  assert.equal(fr.length, 3, 'R2R: 2 dates × 2 ranges pairwise? no – 2 dates, 2 ranges → pairwise = 2, plus I2P 1');
  assert.equal(fr[0].stream, 'R2R'); assert.equal(fr[0].date, '2026-10-19'); assert.equal(fr[0].start, '10:00');
  assert.equal(fr[1].date, '2026-10-20'); assert.equal(fr[1].start, '13:00');
  const uk = p.sessions.find(s => s.country === 'UK&I');
  assert.equal(uk.incomplete, true);
  assert.equal(p.sessions.find(s => s.country === 'KR').tz, 'KST');
});
