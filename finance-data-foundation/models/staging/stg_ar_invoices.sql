-- The receivables subledger, one row per customer invoice, converted to EUR
-- at the issue month's rate. Open-item logic lives downstream; this model
-- only types, converts and keys.

with src as (
    select
        invoice_id,
        entity,
        customer_id,
        cast(issue_date as date) as issue_date,
        cast(due_date as date)   as due_date,
        cast(paid_date as date)  as paid_date,
        currency,
        cast(amount as double)   as amount_dc
    from read_csv('data/raw/ar_invoices.csv', header = true, all_varchar = true)
),

fx as (
    select
        month,
        currency,
        cast(rate_to_eur as double) as rate_to_eur
    from read_csv('data/raw/fx_rates.csv', header = true, all_varchar = true)
)

select
    s.*,
    s.amount_dc / coalesce(f.rate_to_eur, 1.0) as amount_eur
from src s
left join fx f
    on f.currency = s.currency
    and f.month = strftime(s.issue_date, '%Y-%m')
