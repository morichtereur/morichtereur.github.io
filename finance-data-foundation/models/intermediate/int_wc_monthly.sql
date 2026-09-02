-- One row per entity per month — plus a GROUP rollup — carrying everything
-- the working-capital marts need: closing balances of the three working-
-- capital accounts, the month's revenue, COGS and purchases, and a month
-- index for window arithmetic. All EUR, all from the staged ledger.

with gl as (
    select * from {{ ref('stg_gl_lines') }}
),

per_entity as (
    select
        entity,
        posting_month as month,
        sum(case when account = '1200' then debit_eur - credit_eur else 0 end) as ar_delta,
        sum(case when account = '2100' then credit_eur - debit_eur else 0 end) as ap_delta,
        sum(case when account = '1300' then debit_eur - credit_eur else 0 end) as inv_delta,
        sum(case when account = '1300' then debit_eur else 0 end)              as purchases_eur,
        sum(case when account in ('4000', '4100') then credit_eur - debit_eur else 0 end) as revenue_eur,
        sum(case when account = '5000' then debit_eur - credit_eur else 0 end) as cogs_eur
    from gl
    group by 1, 2
),

with_group as (
    select * from per_entity
    union all
    select
        'GROUP' as entity,
        month,
        sum(ar_delta), sum(ap_delta), sum(inv_delta),
        sum(purchases_eur), sum(revenue_eur), sum(cogs_eur)
    from per_entity
    group by month
)

select
    entity,
    month,
    cast(substr(month, 1, 4) as integer) * 12
        + cast(substr(month, 6, 2) as integer)              as month_idx,
    date_diff(
        'day',
        cast(strptime(month || '-01', '%Y-%m-%d') as date),
        cast(strptime(month || '-01', '%Y-%m-%d') as date) + interval 1 month
    )                                                       as days_in_month,
    sum(ar_delta)  over w                                   as ar_end_eur,
    sum(ap_delta)  over w                                   as ap_end_eur,
    sum(inv_delta) over w                                   as inv_end_eur,
    revenue_eur,
    cogs_eur,
    purchases_eur,
    sum(revenue_eur) over w                                 as cum_revenue_eur
from with_group
window w as (partition by entity order by month rows between unbounded preceding and current row)
