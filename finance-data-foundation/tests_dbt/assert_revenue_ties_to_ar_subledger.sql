-- Cross-source reconciliation: every euro of revenue in the P&L mart was
-- invoiced to a customer, month by month. The P&L figure comes from the
-- general ledger, the comparison from the AR subledger file — two files, one
-- number, converted at the same monthly rate.

with pnl_revenue as (
    select
        month,
        sum(amount_eur) as revenue_pnl
    from {{ ref('fct_pnl_monthly') }}
    where line = 'revenue'
    group by 1
),

invoiced as (
    select
        strftime(issue_date, '%Y-%m') as month,
        sum(amount_eur)               as revenue_invoiced
    from {{ ref('stg_ar_invoices') }}
    group by 1
)

select
    p.month,
    p.revenue_pnl,
    i.revenue_invoiced,
    p.revenue_pnl - i.revenue_invoiced as difference
from pnl_revenue p
inner join invoiced i on i.month = p.month
where abs(p.revenue_pnl - i.revenue_invoiced) > 0.05
