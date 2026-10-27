"""Authoring layer for a fit-gap deliverable: level-3 and level-4 dictionaries, default decision lines per level-3
group and rating, detail dictionaries and the cover glossary → resolved content JSON for build_fitgap.py.

A stream content module (kept with the client data, never in the repository) does:

    from author import Content
    c = Content('A2R', country='COUNTRY', entities=[('1001', 'Entity A (1001)'), ('100A', 'Entity A – Hub (100A)')])
    c.cover = [{'title': 'Abbreviations used in the comments', 'items': [['SSC / GBS', '…'], …]}, …]
    c.l3['A2R 1.1.1'] = {'fte': 'Agreed to transfer; …', 'cmt': 'As-is: …\\nTo-be: …', 'd_sys': 'SAP FI-AA', …}
    c.l4['A2R 1.1.1.2'] = {'gap': 'HARMONIZATION GAP', 'cmt': 'Agreement to transfer … to SSC …', 'tb': 'gbs', 'sys': 'SAP FI-AA'}
    c.defaults['A2R 1.1.1'] = {'HARMONIZATION GAP': 'Agreement to transfer … to SSC …', 'STANDARDIZATION GAP': '…'}
    c.vws['A2R 1.1.1.2'] = {'cmt': '<full cleaned session notes>'}
    c.yellow['A2R 1.3.2.4'] = ['fte', 'cmt']            # genuinely open topic with a named follow-up
    c.resolve('<capture.xlsx>', '<content.json>')

Values may be a string (both entities) or {'1001': …, '100A': …}. 'tb' is a shorthand for the to-be split:
'gbs' | 'local' | 'other' | 'local+gbs' | 'local+other' | ''. Fields not given keep the capture file's
pre-assessment values; None clears a cell. Level-4 rows rated NO GAP / N/A / OUT OF SCOPE never carry a comment;
gap rows without an explicit comment take the default line of their level-3 group and rating.
"""
import json
import re

import openpyxl

from fitgap_layout import BLOCK_FIELDS, TemplateLayout, normalize_rating

NO_COMMENT = {'NO GAP', 'N/A', 'OUT OF SCOPE'}
TB = {'gbs': {'tb_gbs': 'x'}, 'local': {'tb_local': 'x'}, 'other': {'tb_other': 'x'},
      'local+gbs': {'tb_local': 'x', 'tb_gbs': 'x'}, 'local+other': {'tb_local': 'x', 'tb_other': 'x'},
      'gbs+other': {'tb_gbs': 'x', 'tb_other': 'x'}, '': {}}


class Content:
    def __init__(self, ws, country, entities, template_sheet=None, cover_key_width=30.0):
        self.ws, self.country = ws, country.upper()
        self.entities = entities                       # [(code, label), …] – block order of the deliverable
        self.template_sheet = template_sheet
        self.cover_key_width = cover_key_width
        self.cover = []
        self.l3, self.l4, self.defaults, self.vws, self.yellow = {}, {}, {}, {}, {}
        self.rows_extra = {}                           # anything keyed by row ('row:<n>') or duplicate ids ('<pid>#2')
        self.final_sheet = f'Fit-Gap_{ws}_{self.country}'
        self.vws_sheet = f'Fit-Gap_{ws}_{self.country}_vWS'

    # ---- helpers
    def _per_entity(self, spec):
        """{field: value | {code: value}} → {code: {field: value}} (with 'tb' shorthand expanded)."""
        out = {code: {} for code, _ in self.entities}
        for k, v in (spec or {}).items():
            if k == 'tb':
                for code, _ in self.entities:
                    tbv = v.get(code) if isinstance(v, dict) else v
                    if tbv is None:
                        continue
                    out[code].update({'tb_local': None, 'tb_other': None, 'tb_gbs': None})
                    out[code].update(TB[tbv])
                continue
            if k not in BLOCK_FIELDS:
                raise KeyError(f'unknown field {k!r} (allowed: {BLOCK_FIELDS} and "tb")')
            if isinstance(v, dict):
                for code, vv in v.items():
                    out[code][k] = vv
            else:
                for code, _ in self.entities:
                    out[code][k] = v
        return out

    @staticmethod
    def _l3_of(pid):
        m = re.match(r'(\S+)\s+(\d+(?:\.\d+)*)', pid or '')
        if not m:
            return None
        parts = m.group(2).split('.')
        return f'{m.group(1)} {".".join(parts[:3])}' if len(parts) >= 3 else None

    def resolve(self, template, out):
        wb = openpyxl.load_workbook(template, read_only=False)
        name = self.template_sheet or next(n for n in wb.sheetnames if 'fit' in n.lower() and 'gap' in n.lower())
        lay = TemplateLayout(wb[name])
        rows = {}
        seen = {}
        unknown = set(self.l3) | set(self.l4) | set(self.vws) | set(self.yellow) | set(self.rows_extra)
        for (r, lv, pid, pname, desc) in lay.rows():
            key = pid or f'row:{r}'
            if pid:
                seen[pid] = seen.get(pid, 0) + 1
                if seen[pid] > 1:
                    key = f'{pid}#{seen[pid]}'
            unknown.discard(key)
            base = {code: lay.block_values(r, min(b, len(lay.blocks) - 1)) for b, (code, _) in enumerate(self.entities)}
            spec = self.l3.get(key) if lv == 3 else self.l4.get(key) if lv in (4, 5) else None
            spec = spec or self.rows_extra.get(key)
            final = {code: dict(base[code]) for code in base}
            for code, vals in self._per_entity(spec).items():
                final[code].update(vals)
            for code in final:
                g = normalize_rating(final[code].get('gap')) if final[code].get('gap') else None
                final[code]['gap'] = g
                if lv in (4, 5):
                    if g in NO_COMMENT:
                        final[code]['cmt'] = None
                    elif g and not final[code].get('cmt'):
                        line = self.defaults.get(self._l3_of(pid), {}).get(g)
                        final[code]['cmt'] = line.get(code) if isinstance(line, dict) else line
                if g == 'OUT OF SCOPE' or (lv in (1, 2) and g == 'OUT OF SCOPE'):
                    final[code]['fte'] = None; final[code]['cmt'] = None
            entry = {'final': final}
            if key in self.vws:
                v = {code: dict(final[code]) for code in final}
                for code, vals in self._per_entity(self.vws[key]).items():
                    v[code].update(vals)
                entry['vws'] = v
            if key in self.yellow:
                y = self.yellow[key]
                entry['yellow'] = y if isinstance(y, dict) else {code: list(y) for code, _ in self.entities}
            rows[key] = entry
        if unknown:
            raise KeyError(f'content keys not in the template: {sorted(unknown)[:20]}')
        content = {
            'ws': self.ws, 'country': self.country, 'template_sheet': name,
            'final_sheet': self.final_sheet, 'vws_sheet': self.vws_sheet,
            'entities': [{'code': code, 'label': label, 'template_block': min(i, len(lay.blocks) - 1)} for i, (code, label) in enumerate(self.entities)],
            'cover': self.cover, 'cover_key_width': self.cover_key_width, 'rows': rows,
        }
        json.dump(content, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        n3 = sum(1 for k in rows if k in self.l3); n4 = sum(1 for k in rows if k in self.l4)
        print(f'{self.ws}: {len(rows)} rows resolved ({n3} level-3 and {n4} level-4 entries authored, {len(self.vws)} vWS notes) → {out}')
        return content
