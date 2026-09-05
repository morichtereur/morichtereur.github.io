#!/usr/bin/env python3
"""Bake the built marts into the self-contained dashboard.

Reads fdf.duckdb (the dbt build output) and target/run_results.json (the test
results), assembles one JSON payload, and writes dashboard.html from the
template with the payload and the embedded fonts inlined. The dashboard is a
single file on purpose — the site vendors it as-is, no build step, no fetch.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb

HERE = Path(__file__).parent

# What each reconciliation test guards, in words a reader can act on. The
# keys are the dbt test names; anything not listed renders under the generic
# count instead.
RECONCILIATIONS = {
    "assert_journals_balance": (
        "Every journal balances",
        "Debits equal credits per document, in document currency — parsing bent no amount.",
    ),
    "assert_gl_line_unique": (
        "No duplicated ledger lines",
        "One row per (entity, doc, line) after staging — the twice-loaded DE01 extract is provably gone.",
    ),
    "assert_ar_subledger_ties_to_gl": (
        "Receivables tie to the control account",
        "Open customer invoices equal the 1200 balance at every month-end, per entity.",
    ),
    "assert_ap_subledger_ties_to_gl": (
        "Payables tie to the control account",
        "Open vendor invoices equal the 2100 balance at every month-end, per entity.",
    ),
    "assert_inventory_snapshot_ties_to_gl": (
        "Inventory snapshot ties to the ledger",
        "The warehouse month-end count and the 1300 balance agree — two systems, one number.",
    ),
    "assert_revenue_ties_to_ar_subledger": (
        "P&L revenue ties to invoicing",
        "Every euro of revenue in the mart was invoiced to a customer in the same month.",
    ),
}

# The residual each reconciliation actually leaves, recomputed here with no
# tolerance so the dashboard can print the worst case rather than "passed".
RESIDUAL_QUERIES = {
    "assert_journals_balance": """
        select max(abs(imb)) from (
            select sum(debit_dc) - sum(credit_dc) as imb
            from stg_gl_lines group by entity, doc_id)
    """,
    "assert_ar_subledger_ties_to_gl": """
        with me as (
            select distinct entity, posting_month as month,
                last_day(cast(strptime(posting_month || '-01', '%Y-%m-%d') as date)) as eom
            from stg_gl_lines),
        gl as (
            select m.entity, m.month, coalesce(sum(g.debit_dc - g.credit_dc), 0) as bal
            from me m left join stg_gl_lines g
              on g.entity = m.entity and g.account = '1200' and g.posting_date <= m.eom
            group by 1, 2),
        sl as (
            select m.entity, m.month, coalesce(sum(a.amount_dc), 0) as open_amt
            from me m left join stg_ar_invoices a
              on a.entity = m.entity and a.issue_date <= m.eom
              and (a.paid_date is null or a.paid_date > m.eom)
            group by 1, 2)
        select max(abs(gl.bal - sl.open_amt))
        from gl join sl on sl.entity = gl.entity and sl.month = gl.month
    """,
}


def q(con, sql: str) -> list[tuple]:
    return con.sql(sql).fetchall()


def scalar(con, sql: str):
    return con.sql(sql).fetchone()[0]


def build_payload() -> dict:
    con = duckdb.connect(str(HERE / "fdf.duckdb"), read_only=True)

    folio = {
        "journal_lines": scalar(con, "select count(*) from stg_gl_lines"),
        "ar_invoices": scalar(con, "select count(*) from stg_ar_invoices"),
        "months": scalar(con, "select count(distinct posting_month) from stg_gl_lines"),
    }

    revenue = [
        {"month": m, "naive": round(n), "governed": round(g)}
        for m, n, g in q(con, """
            select month, naive_revenue, governed_revenue_eur
            from fct_naive_consolidation order by month""")
    ]

    overstatement_2025 = scalar(con, """
        select sum(overstatement_eur) from fct_naive_consolidation
        where month like '2025%'""")
    governed_2025 = scalar(con, """
        select sum(governed_revenue_eur) from fct_naive_consolidation
        where month like '2025%'""")

    # Decompose the FY2025 overstatement into its two silent errors.
    pln_component = scalar(con, """
        select sum(credit_dc - debit_dc) - sum(credit_eur - debit_eur)
        from stg_gl_lines
        where entity = 'PL01' and account in ('4000', '4100')
          and posting_month like '2025%'""")
    dup_component = scalar(con, """
        select sum(credit_eur - debit_eur)
        from stg_gl_lines
        where entity = 'DE01' and account in ('4000', '4100')
          and posting_month = '2025-03'""")

    dso = [
        {"month": m,
         "ending": round(e, 2) if e is not None else None,
         "rolling": round(r, 2) if r is not None else None,
         "countback": round(c, 2) if c is not None else None}
        for m, e, r, c in q(con, """
            select month, dso_ending_balance, dso_rolling_quarter, dso_countback
            from fct_dso_definitions order by month""")
    ]

    pnl: dict[str, list] = {}
    for ent, month, rev, cogs, opex in q(con, """
        select entity, month,
            sum(case when line = 'revenue' then amount_eur else 0 end),
            sum(case when line = 'cogs' then amount_eur else 0 end),
            sum(case when line = 'opex' then amount_eur else 0 end)
        from fct_pnl_monthly
        group by 1, 2
        union all
        select 'GROUP', month,
            sum(case when line = 'revenue' then amount_eur else 0 end),
            sum(case when line = 'cogs' then amount_eur else 0 end),
            sum(case when line = 'opex' then amount_eur else 0 end)
        from fct_pnl_monthly
        group by 1, 2
        order by 1, 2"""):
        pnl.setdefault(ent, []).append({
            "month": month,
            "revenue": round(rev),
            "cogs": round(cogs),
            "opex": round(opex),
            "ebit": round(rev - cogs - opex),
        })

    wc = [
        {"month": m,
         "dso": round(a, 1) if a is not None else None,
         "dio": round(b, 1) if b is not None else None,
         "dpo": round(c, 1) if c is not None else None,
         "ccc": round(d, 1) if d is not None else None}
        for m, a, b, c, d in q(con, """
            select month, dso, dio, dpo, ccc
            from fct_working_capital_monthly
            where entity = 'GROUP' order by month""")
    ]

    run_results = json.loads((HERE / "target" / "run_results.json").read_text())
    tests_total = tests_passed = 0
    recon_rows = []
    for res in run_results["results"]:
        if res["unique_id"].startswith("test."):
            tests_total += 1
            if res["status"] == "pass":
                tests_passed += 1
            name = res["unique_id"].split(".")[2]
            if name in RECONCILIATIONS:
                title, desc = RECONCILIATIONS[name]
                residual = None
                if name in RESIDUAL_QUERIES:
                    residual = scalar(con, RESIDUAL_QUERIES[name])
                recon_rows.append({
                    "title": title, "description": desc,
                    "status": res["status"],
                    "residual": round(residual, 4) if residual is not None else None,
                })

    recon_rows.sort(key=lambda r: r["title"])

    dec24 = next(d for d in dso if d["month"] == "2024-12")
    dec25 = next(d for d in dso if d["month"] == "2025-12")

    return {
        "folio": folio,
        "verdict": {
            "overstatement_2025": round(overstatement_2025),
            "governed_2025": round(governed_2025),
            "pln_component": round(pln_component),
            "dup_component": round(dup_component),
            "tests_passed": tests_passed,
            "tests_total": tests_total,
        },
        "revenue": revenue,
        "dso": dso,
        "dso_yoy": {
            "ending": [dec24["ending"], dec25["ending"]],
            "rolling": [dec24["rolling"], dec25["rolling"]],
            "countback": [dec24["countback"], dec25["countback"]],
        },
        "pnl": pnl,
        "wc": wc,
        "reconciliations": recon_rows,
    }


def main() -> None:
    payload = build_payload()
    template = (HERE / "dashboard_template.html").read_text()
    fonts = (HERE / "assets" / "fonts.css").read_text().strip()
    html = template.replace("/*__FONTS__*/", fonts)
    marker = "const DATA=__DATA__;"
    assert marker in html, "template lost its data marker"
    html = html.replace(marker, "const DATA=" + json.dumps(payload, separators=(",", ":")) + ";")
    out = HERE / "dashboard.html"
    out.write_text(html)
    print(f"wrote {out} ({out.stat().st_size:,} bytes)")
    v = payload["verdict"]
    print(f"  FY2025 phantom revenue: {v['overstatement_2025']:,} EUR "
          f"(PLN-as-EUR {v['pln_component']:,} + doubled extract {v['dup_component']:,})")
    print(f"  tests: {v['tests_passed']}/{v['tests_total']}")


if __name__ == "__main__":
    main()
