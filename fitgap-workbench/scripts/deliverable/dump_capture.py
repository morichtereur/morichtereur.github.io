#!/usr/bin/env python3
"""Dumps a capture workbook row by row (both entity blocks, standard split, cell notes) as markdown, marking every
cell that differs from the pre-assessment version – the working basis for authoring the deliverable content.

    python scripts/deliverable/dump_capture.py <capture.xlsx> [--pre <pre-assessment.xlsx>] [--out notes.md]
"""
import argparse
from collections import Counter

import openpyxl

from fitgap_layout import BLOCK_FIELDS, TemplateLayout

SHOW = ['as_le', 'as_gbs', 'sys', 'gap', 'info', 'tb_local', 'tb_other', 'tb_gbs', 'fte', 'cmt', 'd_sys', 'd_wf', 'd_cur', 'd_ext', 'd_lang', 'd_legal', 'd_ics']


def load(path):
    wb = openpyxl.load_workbook(path)
    name = next(n for n in wb.sheetnames if 'fit' in n.lower() and 'gap' in n.lower())
    ws = wb[name]
    lay = TemplateLayout(ws)
    rows = {}
    seen = Counter()
    for (r, lv, pid, pname, desc) in lay.rows():
        key = pid or f'row:{r}'
        if pid:
            seen[pid] += 1
            if seen[pid] > 1:
                key = f'{pid}#{seen[pid]}'
        rows[key] = {'row': r, 'level': lv, 'pid': pid, 'name': pname, 'desc': desc, 'std': lay.std_values(r),
                     'blocks': [lay.block_values(r, b) for b in range(len(lay.blocks))],
                     'notes': {c: ws.cell(r, c).comment.text for c in range(1, ws.max_column + 1) if ws.cell(r, c).comment}}
    return wb, ws, lay, rows


def dump(capture, pre=None, out=None):
    wb, ws, lay, rows = load(capture)
    pre_rows = load(pre)[3] if pre else {}
    lines = [f'# Capture dump: {capture}', f'', f'Layout: {lay.describe()}', f'Blocks: {[b["label"] for b in lay.blocks]}', '']
    if pre:
        lines.append(f'Pre-assessment: {pre} – cells that differ are marked **Δ** with the old value in ⟨⟩.')
        lines.append('')
    stats = Counter()
    for key, row in rows.items():
        lv = row['level']
        head = f"{'#' * min(6, (lv or 1) + 1)} {key} · {row['name'] or ''}" if lv else f"### {key} (no level) · {row['name'] or ''}"
        body = []
        if lv in (3, 4, 5) and row['desc']:
            body.append(f"_{str(row['desc']).strip()[:300]}_")
        std = {k: v for k, v in row['std'].items() if v not in (None, '', '\xa0')}
        if std:
            body.append('standard: ' + ', '.join(f'{k[4:]}={v}' for k, v in std.items()))
        for b, vals in enumerate(row['blocks']):
            prev = pre_rows.get(key, {}).get('blocks', [None] * 9)
            prev = prev[b] if b < len(prev) and prev[b] else {}
            parts = []
            for k in SHOW:
                v = vals.get(k)
                pv = prev.get(k) if prev else None
                if v in (None, '') and pv in (None, ''):
                    continue
                mark = ''
                if pre and (v or None) != (pv or None):
                    mark = f' **Δ**⟨{pv}⟩'
                    stats[k] += 1
                parts.append(f'{k}={str(v).strip() if v is not None else "∅"}{mark}')
            if parts:
                body.append(f'- block{b + 1} {lay.blocks[b]["label"]}: ' + ' | '.join(parts))
        for c, note in row['notes'].items():
            body.append(f'- note@{openpyxl.utils.get_column_letter(c)}: {note.strip()[:400]}')
        if body or lv in (1, 2, 3):
            lines.append(head)
            lines.extend(body)
            lines.append('')
    if pre:
        lines.insert(5, 'Changed cells vs pre-assessment by field: ' + ', '.join(f'{k}: {n}' for k, n in stats.most_common()))
    md = '\n'.join(lines)
    if out:
        open(out, 'w', encoding='utf-8').write(md)
        print(f'{len(rows)} rows → {out}; changed cells vs pre-assessment: {sum(stats.values())}')
    else:
        print(md)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('capture'); ap.add_argument('--pre'); ap.add_argument('--out')
    a = ap.parse_args()
    dump(a.capture, a.pre, a.out)
