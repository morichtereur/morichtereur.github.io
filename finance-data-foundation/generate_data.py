#!/usr/bin/env python3
"""Generate the synthetic ERP extracts this project runs on.

Three legal entities export their general ledger the way real ERP jobs do —
each in its own dialect. DE01 writes German dates and decimal commas, PL01
posts in złoty, and one DE01 extract job ran twice, so March 2025 is in the
file twice. The staging layer has to earn its keep against these files, and
every mess here is deliberate, seeded and reproducible.

Every business event posts a balanced journal, and the AR/AP subledgers mirror
the control accounts line for line, so the dbt reconciliation tests downstream
assert ties that genuinely hold — or genuinely fail when a model is wrong.
"""

from __future__ import annotations

import csv
import math
import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

SEED = 7
RAW = Path(__file__).parent / "data" / "raw"

START = date(2024, 1, 1)
END = date(2025, 12, 31)
MONTHS = [(y, m) for y in (2024, 2025) for m in range(1, 13)]

# Q4-heavy seasonality, indexed by calendar month.
SEASON = [0.95, 0.97, 1.02, 1.00, 0.98, 1.03, 0.96, 0.92, 1.05, 1.08, 1.06, 1.15]
MONTHLY_GROWTH = 1.015

ACCOUNTS = [
    ("1000", "Cash and equivalents", "BS", "asset"),
    ("1200", "Trade receivables", "BS", "asset"),
    ("1300", "Inventory", "BS", "asset"),
    ("1500", "Property, plant and equipment", "BS", "asset"),
    ("1590", "Accumulated depreciation", "BS", "asset"),
    ("2100", "Trade payables", "BS", "liability"),
    ("3000", "Equity and retained earnings", "BS", "equity"),
    ("4000", "Product revenue", "PL", "revenue"),
    ("4100", "Service revenue", "PL", "revenue"),
    ("5000", "Cost of goods sold", "PL", "cogs"),
    ("6000", "Payroll", "PL", "opex"),
    ("6100", "Rent and facilities", "PL", "opex"),
    ("6200", "IT and software", "PL", "opex"),
    ("6300", "Travel", "PL", "opex"),
    ("6400", "Other operating expense", "PL", "opex"),
    ("6900", "Depreciation", "PL", "opex"),
]

OPEX_ACCOUNTS = ["6100", "6200", "6300", "6400"]


@dataclass
class Entity:
    code: str
    name: str
    currency: str
    base_revenue: float  # monthly product revenue at t0, in document currency
    service_share: float
    invoice_count: int  # AR invoices per month at t0
    pay_days_mean: float  # customer payment behaviour
    pay_days_late_drift: float  # extra days per month from 2025-07
    ap_days_mean: float  # how fast the entity pays vendors
    payroll: float
    opening_cash: float
    opening_inventory: float
    opening_ppe: float
    date_format: str  # 'iso' or 'de'
    decimal_comma: bool
    journals: list = field(default_factory=list)
    doc_seq: int = 0

    def next_doc(self, year: int) -> str:
        self.doc_seq += 1
        return f"{self.code}-{year}-{self.doc_seq:06d}"


def entities() -> list[Entity]:
    return [
        Entity("DE01", "Hamburg", "EUR", 1_180_000, 0.22, 118, 38, 0.9, 34,
               520_000, 900_000, 1_400_000, 2_600_000, "de", True),
        Entity("NL01", "Amsterdam", "EUR", 790_000, 0.30, 82, 32, 0.4, 30,
               380_000, 700_000, 850_000, 1_500_000, "iso", False),
        Entity("PL01", "Kraków", "PLN", 1_520_000, 0.15, 54, 46, 0.7, 41,
               680_000, 2_400_000, 2_900_000, 4_100_000, "iso", False),
    ]


def month_end(y: int, m: int) -> date:
    return (date(y + m // 12, m % 12 + 1, 1) - timedelta(days=1)) if m < 13 else date(y, 12, 31)


def month_index(y: int, m: int) -> int:
    return (y - 2024) * 12 + (m - 1)


def fx_rates() -> dict[tuple[int, int], float]:
    """EUR/PLN, one rate per month, drifting inside a believable band."""
    rng = random.Random(SEED + 100)
    rates = {}
    rate = 4.32
    for y, m in MONTHS:
        rate = min(4.55, max(4.18, rate + rng.uniform(-0.04, 0.045)))
        rates[(y, m)] = round(rate, 4)
    return rates


@dataclass
class Journal:
    doc_id: str
    posting_date: date
    lines: list  # (account, debit, credit, partner)

    def balanced(self) -> bool:
        return abs(sum(d for _, d, _, _ in self.lines) - sum(c for _, _, c, _ in self.lines)) < 0.005


def post(ent: Entity, doc_id: str, when: date, lines: list) -> None:
    j = Journal(doc_id, when, [(a, round(d, 2), round(c, 2), p) for a, d, c, p in lines])
    assert j.balanced(), f"unbalanced journal {doc_id}: {j.lines}"
    ent.journals.append(j)


def spread_amounts(total: float, n: int, rng: random.Random) -> list[float]:
    """Split a monthly total into n invoice amounts, right-skewed like real books."""
    weights = [rng.lognormvariate(0, 0.9) for _ in range(n)]
    s = sum(weights)
    amounts = [round(total * w / s, 2) for w in weights]
    amounts[-1] = round(amounts[-1] + (total - sum(amounts)), 2)
    return amounts


def generate() -> None:
    rng = random.Random(SEED)
    RAW.mkdir(parents=True, exist_ok=True)
    ents = entities()
    fx = fx_rates()

    ar_rows: list[dict] = []
    ap_rows: list[dict] = []
    inv_rows: list[dict] = []

    for ent in ents:
        # Opening balances, 2024-01-01. AR and AP open at zero on purpose:
        # both subledgers then tie to their control accounts from the first
        # invoice onward, with no unmatchable opening lump.
        opening_equity = ent.opening_cash + ent.opening_inventory + ent.opening_ppe
        post(ent, ent.next_doc(2024), START, [
            ("1000", ent.opening_cash, 0, ""),
            ("1300", ent.opening_inventory, 0, ""),
            ("1500", ent.opening_ppe, 0, ""),
            ("3000", 0, opening_equity, ""),
        ])

        inventory_balance = ent.opening_inventory

        for y, m in MONTHS:
            t = month_index(y, m)
            eom = month_end(y, m)
            growth = MONTHLY_GROWTH ** t
            season = SEASON[m - 1]

            product_rev = ent.base_revenue * growth * season * rng.uniform(0.96, 1.04)
            service_rev = product_rev * ent.service_share * rng.uniform(0.9, 1.1)

            # --- AR: customer invoices and their payments -------------------
            n_inv = max(8, round(ent.invoice_count * growth * season))
            amounts = spread_amounts(product_rev + service_rev, n_inv, rng)
            service_cut = service_rev / (product_rev + service_rev)

            # December 2025: a fat year-end deal lands in the last week.
            # Ending-balance DSO will see it; countback barely will.
            if (y, m) == (2025, 12):
                amounts[0] = round(amounts[0] + 0.45 * sum(amounts), 2)

            for i, gross in enumerate(amounts):
                if (y, m) == (2025, 12) and i == 0:
                    issue = date(2025, 12, rng.randint(22, 29))
                else:
                    issue = date(y, m, rng.randint(1, eom.day))
                cust = f"C{rng.randint(1, 40):03d}"
                inv_id = f"AR-{ent.code}-{y}{m:02d}-{i + 1:04d}"
                svc = round(gross * service_cut, 2)
                prod = round(gross - svc, 2)

                post(ent, ent.next_doc(y), issue, [
                    ("1200", gross, 0, cust),
                    ("4000", 0, prod, cust),
                    ("4100", 0, svc, cust),
                ])

                terms = 30 if rng.random() < 0.7 else 45
                due = issue + timedelta(days=terms)
                late_drift = ent.pay_days_late_drift * max(0, t - 17)  # from 2025-07
                delay = rng.lognormvariate(math.log(ent.pay_days_mean + late_drift), 0.35)
                paid = issue + timedelta(days=max(3, round(delay)))
                paid_str = paid.isoformat()
                if paid <= END:
                    post(ent, ent.next_doc(y), paid, [
                        ("1000", gross, 0, cust),
                        ("1200", 0, gross, cust),
                    ])

                ar_rows.append({
                    "invoice_id": inv_id, "entity": ent.code, "customer_id": cust,
                    "issue_date": issue.isoformat(), "due_date": due.isoformat(),
                    "paid_date": paid_str, "currency": ent.currency, "amount": gross,
                })

            # --- COGS relief and inventory replenishment --------------------
            margin_drift = 0.58 + 0.02 * math.sin(t / 5)
            cogs = round(product_rev * margin_drift, 2)
            purchases = round(cogs * rng.uniform(0.95, 1.12), 2)
            if inventory_balance + purchases < cogs * 1.1:
                purchases = round(cogs * 1.3, 2)

            # Several deliveries a month, not one lump — a single monthly
            # invoice makes DPO seesaw in a way no real payables book does.
            n_deliveries = rng.randint(3, 5)
            delivery_amounts = spread_amounts(purchases, n_deliveries, rng)
            for di, damt in enumerate(delivery_amounts, start=1):
                vend = f"V{rng.randint(1, 25):03d}"
                inv_issue = date(y, m, rng.randint(1, min(24, eom.day)))
                post(ent, ent.next_doc(y), inv_issue, [
                    ("1300", damt, 0, vend),
                    ("2100", 0, damt, vend),
                ])
                ap_pay = inv_issue + timedelta(days=max(5, round(rng.gauss(ent.ap_days_mean, 6))))
                if ap_pay <= END:
                    post(ent, ent.next_doc(y), ap_pay, [
                        ("2100", damt, 0, vend),
                        ("1000", 0, damt, vend),
                    ])
                ap_rows.append({
                    "invoice_id": f"AP-{ent.code}-{y}{m:02d}-INV{di}", "entity": ent.code,
                    "vendor_id": vend, "issue_date": inv_issue.isoformat(),
                    "paid_date": ap_pay.isoformat(), "currency": ent.currency,
                    "amount": damt, "category": "inventory",
                })

            post(ent, ent.next_doc(y), eom, [
                ("5000", cogs, 0, ""),
                ("1300", 0, cogs, ""),
            ])
            inventory_balance = inventory_balance + purchases - cogs
            inv_rows.append({
                "entity": ent.code, "month": f"{y}-{m:02d}",
                "currency": ent.currency, "closing_value": round(inventory_balance, 2),
            })

            # --- Opex through AP, payroll and depreciation ------------------
            for acct in OPEX_ACCOUNTS:
                base = {"6100": 0.055, "6200": 0.045, "6300": 0.020, "6400": 0.030}[acct]
                amt = round(product_rev * base * rng.uniform(0.8, 1.25), 2)
                vend = f"V{rng.randint(26, 60):03d}"
                ox_issue = date(y, m, rng.randint(1, min(20, eom.day)))
                post(ent, ent.next_doc(y), ox_issue, [
                    (acct, amt, 0, vend),
                    ("2100", 0, amt, vend),
                ])
                ox_pay = ox_issue + timedelta(days=max(5, round(rng.gauss(ent.ap_days_mean, 6))))
                if ox_pay <= END:
                    post(ent, ent.next_doc(y), ox_pay, [
                        ("2100", amt, 0, vend),
                        ("1000", 0, amt, vend),
                    ])
                ap_rows.append({
                    "invoice_id": f"AP-{ent.code}-{y}{m:02d}-{acct}", "entity": ent.code,
                    "vendor_id": vend, "issue_date": ox_issue.isoformat(),
                    "paid_date": ox_pay.isoformat(), "currency": ent.currency,
                    "amount": amt, "category": "opex",
                })

            payroll = round(ent.payroll * (1.002 ** t) * rng.uniform(0.99, 1.01), 2)
            post(ent, ent.next_doc(y), date(y, m, min(25, eom.day)), [
                ("6000", payroll, 0, ""),
                ("1000", 0, payroll, ""),
            ])

            dep = round(ent.opening_ppe / 96, 2)  # 8-year straight line
            post(ent, ent.next_doc(y), eom, [
                ("6900", dep, 0, ""),
                ("1590", 0, dep, ""),
            ])

    # ------------------------------------------------------------------ write
    for ent in ents:
        write_gl(ent)
    write_dicts(RAW / "ar_invoices.csv", ar_rows)
    write_dicts(RAW / "ap_invoices.csv", ap_rows)
    write_dicts(RAW / "inventory_snapshots.csv", inv_rows)
    write_dicts(RAW / "fx_rates.csv", [
        {"month": f"{y}-{m:02d}", "currency": "PLN", "rate_to_eur": fx[(y, m)]}
        for y, m in MONTHS
    ])
    with open(RAW / "chart_of_accounts.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["account", "account_name", "statement", "line"])
        w.writerows(ACCOUNTS)
    write_dicts(RAW / "entities.csv", [
        {"entity": e.code, "entity_name": e.name, "currency": e.currency}
        for e in ents
    ])

    total_lines = sum(len(j.lines) for e in ents for j in e.journals)
    print(f"journal lines written: {total_lines}")
    print(f"ar invoices: {len(ar_rows)}, ap invoices: {len(ap_rows)}")


def write_gl(ent: Entity) -> None:
    """Write one entity's GL extract, in that entity's dialect.

    DE01: DD.MM.YYYY dates, decimal-comma amounts, and the March 2025 export
    appended a second time — the extract job ran twice and nobody deleted the
    first file's rows. All three quirks are what staging exists to absorb.
    """
    def fmt_date(d: date) -> str:
        return d.strftime("%d.%m.%Y") if ent.date_format == "de" else d.isoformat()

    def fmt_amt(x: float) -> str:
        s = f"{x:.2f}"
        return s.replace(".", ",") if ent.decimal_comma else s

    rows = []
    for j in ent.journals:
        for i, (acct, dr, cr, partner) in enumerate(j.lines, start=1):
            rows.append([
                j.doc_id, i, fmt_date(j.posting_date),
                acct + (" " if ent.code == "PL01" else ""),  # trailing-space padding
                fmt_amt(dr), fmt_amt(cr), ent.currency, partner,
            ])

    if ent.code == "DE01":
        march = [r for r in rows
                 if r[2].endswith(".03.2025") or r[2].startswith("2025-03")]
        rows.extend(march)

    with open(RAW / f"gl_{ent.code}.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["doc_id", "line_no", "posting_date", "account",
                    "debit", "credit", "currency", "partner_id"])
        w.writerows(rows)


def write_dicts(path: Path, rows: list[dict]) -> None:
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    generate()
