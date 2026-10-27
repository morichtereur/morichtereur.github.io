"""Reads the column layout of a GBS fit-gap capture sheet (any of the stream templates) by its header texts.

The templates differ per stream (header row 6–9, as-is block before or after the standard split, RACI in front
or at the end, one or two entity blocks). Everything here is keyed on the header texts, never on fixed columns.
"""
import re
from openpyxl.utils import get_column_letter as L

BLOCK_FIELDS = ['as_le', 'as_gbs', 'sys', 'gap', 'info', 'tb_local', 'tb_other', 'tb_gbs', 'fte', 'cmt',
                'd_sys', 'd_wf', 'd_cur', 'd_ext', 'd_lang', 'd_legal', 'd_ics']
DETAIL_FIELDS = BLOCK_FIELDS[10:]
STD_FIELDS = ['std_le', 'std_gbs', 'std_sys', 'std_init']
RATINGS = ['NO GAP', 'HARMONIZATION GAP', 'STANDARDIZATION GAP', 'BOTH GAPS', 'N/A', 'OUT OF SCOPE']

_norm = lambda s: re.sub(r'\s+', ' ', str(s or '')).strip().lower()


def normalize_rating(raw):
    """Template spellings → the six canonical ratings; anything else is returned unchanged (QA flags it)."""
    t = _norm(raw)
    if not t:
        return None
    if t in ('out of scope', 'oos', 'out-of-scope'):
        return 'OUT OF SCOPE'
    if t in ('n/a', 'na', 'n.a.', 'not applicable'):
        return 'N/A'
    if 'both' in t:
        return 'BOTH GAPS'
    if t.startswith('harmoni') or t.startswith('harmony'):
        return 'HARMONIZATION GAP'
    if t.startswith('standardi') or t.startswith('standardis') or t.startswith('standardiz'):
        return 'STANDARDIZATION GAP'
    if t in ('no gap', 'nogap', 'no gaps', 'fit', 'no-gap'):
        return 'NO GAP'
    return str(raw).strip()


def normalize_yn(raw):
    t = _norm(raw)
    if t in ('y', 'yes', 'x', 'true', '1'):
        return 'Y'
    if t in ('n', 'no', 'false', '0'):
        return 'N'
    return str(raw).strip() if t else None


class TemplateLayout:
    def __init__(self, ws):
        self.ws = ws
        self.hdr = self._find_header_row()
        self.names_row, self.sub_row, self.group_row = self.hdr - 1, self.hdr - 2, self.hdr - 3
        self.max_col = ws.max_column
        self.groups = self._read_groups()
        self.taxonomy = {'level': 2, 'pid': 3, 'name': 4, 'desc': 5}
        self.std = self._read_standard()
        self.blocks = self._read_blocks()
        self.trailing = [g for g in self.groups if g['kind'] in ('procinfo', 'automation', 'change', 'raci')]
        self.trailing.sort(key=lambda g: ['procinfo', 'automation', 'change', 'raci'].index(g['kind']))
        self.last_row = self._last_data_row()
        self.label_row = self._label_row()
        self.taxonomy_title = ws.cell(self.sub_row, 2).value
        self.steps_title = ws.cell(self.names_row, 2).value

    # ---- header rows
    def _find_header_row(self):
        for r in range(1, 15):
            if _norm(self.ws.cell(r, 2).value) == 'process level':
                return r
        raise ValueError('no "Process Level" header row found in the first 15 rows')

    def _span(self, row, col):
        for m in self.ws.merged_cells.ranges:
            if m.min_row <= row <= m.max_row and m.min_col <= col <= m.max_col:
                return m.min_col, m.max_col
        return col, col

    def _read_groups(self):
        ws = self.ws
        starts = [c for c in range(6, self.max_col + 1) if _norm(ws.cell(self.group_row, c).value)]
        groups = []
        for i, c in enumerate(starts):
            title = str(ws.cell(self.group_row, c).value).strip()
            end = (starts[i + 1] - 1) if i + 1 < len(starts) else self.max_col
            end = max(end, self._span(self.group_row, c)[1])
            names = [_norm(ws.cell(self.names_row, x).value) for x in range(c, end + 1)]
            t = _norm(title)
            if 'as-is' in t or 'as is' in t:
                kind = 'asis'
            elif 'fit-gap' in t or 'fit gap' in t or 'fitgap' in t:
                kind = 'fitgap'
            elif 'detailed' in t:
                kind = 'detail'
            elif 'raci' in t:
                kind = 'raci'
            elif 'automation' in t:
                kind = 'automation'
            elif 'change' in t:
                kind = 'change'
            elif 'if needed' in t:
                kind = 'procinfo'
            elif any(n.startswith('le/') for n in names):
                kind = 'standard'
            else:
                kind = 'procinfo'
            # trim trailing empty columns of the last group (merged header cells count as filled)
            merged_max = max([m.max_col for m in ws.merged_cells.ranges if m.min_row <= self.hdr and c <= m.min_col <= end] + [c])
            while end > max(c, merged_max) and not any(_norm(ws.cell(r, end).value) for r in (self.sub_row, self.names_row, self.hdr)):
                end -= 1
            groups.append({'kind': kind, 'title': title, 'start': c, 'end': end})
        # only the first split group is the standard split; a later "PROCESS SPECIFIC INFORMATION" with its own
        # LE/GBS columns (R2R template) is process information and travels with the trailing columns
        seen = False
        for g in groups:
            if g['kind'] == 'standard':
                if seen:
                    g['kind'] = 'procinfo'
                seen = True
        return groups

    def _find(self, start, end, *keys, exclude=()):
        for row in (self.names_row, self.sub_row):
            for c in range(start, end + 1):
                n = _norm(self.ws.cell(row, c).value)
                if n and any(k in n for k in keys) and not any(x in n for x in exclude):
                    return c
        return None

    def _read_standard(self):
        g = next((g for g in self.groups if g['kind'] == 'standard'), None)
        if not g:
            raise ValueError('no standard-split group (TO BE PROCESS SPECIFIC INFORMATION) found')
        s, e = g['start'], g['end']
        return {'std_le': self._find(s, e, 'le/'), 'std_gbs': self._find(s, e, 'gbs'),
                'std_sys': self._find(s, e, 'used system', 'system'), 'std_init': self._find(s, e, 'initiat')}

    def _read_blocks(self):
        kinds = [g['kind'] for g in self.groups]
        blocks = []
        i = 0
        while i < len(self.groups):
            if kinds[i] == 'asis':
                asis = self.groups[i]
                fit = next((g for g in self.groups[i + 1:i + 3] if g['kind'] == 'fitgap'), None)
                det = next((g for g in self.groups[i + 1:i + 4] if g['kind'] == 'detail'), None)
                cols = {}
                s, e = asis['start'], asis['end']
                cols['as_le'] = self._find(s, e, 'le/', 'local le', 'the le')
                cols['as_gbs'] = self._find(s, e, 'gbs')
                cols['sys'] = self._find(s, e, 'used system', 'system')
                cols['gap'] = self._find(s, e, 'gap')
                cols['info'] = self._find(s, e, 'additional information', 'comment', 'finding')
                if fit:
                    s, e = fit['start'], fit['end']
                    cols['tb_local'] = self._find(s, e, 'local accounting', 'local')
                    cols['tb_other'] = self._find(s, e, 'other')
                    cols['tb_gbs'] = self._find(s, e, 'gbs')
                    cols['fte'] = self._find(s, e, 'fte')
                    cols['cmt'] = self._find(s, e, 'comment', 'additional information')
                    if cols['gap'] is None:
                        cols['gap'] = self._find(s, e, 'gap')
                if det:
                    s, e = det['start'], det['end']
                    cols['d_sys'] = self._find(s, e, 'system')
                    cols['d_wf'] = self._find(s, e, 'workflow')
                    cols['d_cur'] = self._find(s, e, 'current process')
                    cols['d_ext'] = self._find(s, e, 'external')
                    cols['d_lang'] = self._find(s, e, 'language')
                    cols['d_legal'] = self._find(s, e, 'legal')
                    cols['d_ics'] = self._find(s, e, 'internal control')
                label = self._entity_label(asis['start'], fit['start'] if fit else None)
                blocks.append({'cols': {k: cols.get(k) for k in BLOCK_FIELDS}, 'label': label, 'asis': asis, 'fit': fit, 'det': det})
                i += 1 + (1 if fit else 0) + (1 if det else 0)
            else:
                i += 1
        if not blocks:
            raise ValueError('no entity block (PRE-FILLED AS-IS …) found')
        return blocks

    def _entity_label(self, *cols):
        texts = []
        for r in range(1, self.group_row):
            for c in cols:
                if c is None:
                    continue
                v = self.ws.cell(r, c).value
                if v and str(v).strip() and str(v).strip() != '\xa0' and str(v).strip() not in texts:
                    texts.append(str(v).strip())
        return ' '.join(texts) if texts else ''

    def _label_row(self):
        """Row that carries the entity names above the first block (templates differ), None when there is none."""
        c = self.blocks[0]['asis']['start']
        for r in range(1, self.group_row):
            v = self.ws.cell(r, c).value
            if v and str(v).strip() and str(v).strip() != '\xa0':
                return r
        return None

    def _last_data_row(self):
        ws = self.ws
        for r in range(ws.max_row, self.hdr, -1):
            if any(ws.cell(r, c).value not in (None, '', '\xa0') for c in range(2, 6)):
                return r
        return self.hdr

    # ---- data access
    def rows(self):
        """Template data rows: (row, level, pid, name, desc)."""
        out = []
        for r in range(self.hdr + 1, self.last_row + 1):
            lv = self.ws.cell(r, 2).value
            try:
                lv = int(lv) if lv not in (None, '', '\xa0') else None
            except (TypeError, ValueError):
                lv = None
            pid = self.ws.cell(r, 3).value
            pid = str(pid).strip() if pid not in (None, '', '\xa0') else None
            out.append((r, lv, pid, self.ws.cell(r, 4).value, self.ws.cell(r, 5).value))
        return out

    def block_values(self, r, b):
        """Pre-assessment values of block b in template row r, normalised; None where empty."""
        cols = self.blocks[min(b, len(self.blocks) - 1)]['cols']
        out = {}
        for k in BLOCK_FIELDS:
            c = cols.get(k)
            v = self.ws.cell(r, c).value if c else None
            v = None if v in (None, '', '\xa0') else (v if not isinstance(v, str) else v.strip())
            if v is not None and k == 'gap':
                v = normalize_rating(v)
            elif v is not None and k in ('as_le', 'as_gbs'):
                v = normalize_yn(v) if _norm(v) != 'out of scope' else v
            elif v is not None and k in ('tb_local', 'tb_other', 'tb_gbs'):
                v = 'x' if _norm(v) in ('x', 'y', 'yes') else v
            out[k] = v
        return out

    def std_values(self, r):
        return {k: (self.ws.cell(r, c).value if c else None) for k, c in self.std.items()}

    def describe(self):
        b = ', '.join(f"block{i + 1}[{L(x['asis']['start'])}…] '{x['label']}'" for i, x in enumerate(self.blocks))
        t = ', '.join(f"{g['kind']} {L(g['start'])}:{L(g['end'])}" for g in self.trailing)
        return (f"header row {self.hdr}, data {self.hdr + 1}–{self.last_row}; standard "
                f"{ {k: L(c) if c else None for k, c in self.std.items()} }; {b}; trailing {t}")
