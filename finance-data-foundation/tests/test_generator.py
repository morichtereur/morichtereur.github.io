"""Invariants on the generated extracts themselves.

The dbt suite tests the staged models; these tests pin down the raw files —
that the mess is exactly the mess we claim (and no other), and that the books
balance before staging ever touches them. If the generator drifts, this fails
before a dbt run ever gets to be misleading.
"""

import csv
from collections import defaultdict
from pathlib import Path

RAW = Path(__file__).parent.parent / "data" / "raw"


def read(name):
    with open(RAW / name, newline="") as f:
        return list(csv.DictReader(f))


def parse_amount(s: str, decimal_comma: bool) -> float:
    return float(s.replace(",", ".")) if decimal_comma else float(s)


def test_every_journal_balances_in_every_dialect():
    for fname, comma in [("gl_DE01.csv", True), ("gl_NL01.csv", False), ("gl_PL01.csv", False)]:
        by_doc = defaultdict(float)
        for r in read(fname):
            by_doc[r["doc_id"]] += parse_amount(r["debit"], comma) - parse_amount(r["credit"], comma)
        worst = max(abs(v) for v in by_doc.values())
        assert worst < 0.005, f"{fname}: worst imbalance {worst}"


def test_de01_march_2025_is_loaded_exactly_twice():
    counts = defaultdict(int)
    march = 0
    for r in read("gl_DE01.csv"):
        key = (r["doc_id"], r["line_no"])
        counts[key] += 1
        if r["posting_date"].endswith(".03.2025"):
            march += 1
    assert march > 0
    dupes = {k: c for k, c in counts.items() if c > 1}
    assert dupes, "the doubled March extract is part of the dataset's contract"
    assert all(c == 2 for c in dupes.values())
    # And nothing outside March 2025 is duplicated.
    by_month = {k: c for k, c in counts.items() if c > 1}
    dated = {r["doc_id"]: r["posting_date"] for r in read("gl_DE01.csv")}
    for (doc_id, _), _ in by_month.items():
        assert dated[doc_id].endswith(".03.2025")


def test_pl01_posts_in_pln_and_pads_accounts():
    rows = read("gl_PL01.csv")
    assert all(r["currency"] == "PLN" for r in rows)
    assert all(r["account"].endswith(" ") for r in rows)


def test_de01_uses_german_dates_and_decimal_commas():
    rows = read("gl_DE01.csv")
    assert all("." in r["posting_date"] and "-" not in r["posting_date"] for r in rows)
    assert all("," in r["debit"] and "," in r["credit"] for r in rows)


def test_ar_invoice_ids_unique():
    ids = [r["invoice_id"] for r in read("ar_invoices.csv")]
    assert len(ids) == len(set(ids))


def test_fx_covers_every_month():
    months = {r["month"] for r in read("fx_rates.csv")}
    expected = {f"{y}-{m:02d}" for y in (2024, 2025) for m in range(1, 13)}
    assert months == expected
