-- Three DSO formulas every finance team has met, computed side by side from
-- the same staged ledger, at group level:
--
--   ending balance — closing AR over the month's revenue, times its days.
--     Simple, common, and hostage to whatever the last week of the month did.
--   rolling quarter — average closing AR over the trailing three month-ends,
--     over trailing-three-month revenue, times those days.
--   countback — the governed definition, from fct_working_capital_monthly.
--
-- None of them is wrong. That is the exhibit: a KPI without a written
-- definition is three KPIs, and the semantic layer is where the writing
-- happens.

with wc as (
    select * from {{ ref('int_wc_monthly') }}
    where entity = 'GROUP'
),

governed as (
    select month, dso as dso_countback
    from {{ ref('fct_working_capital_monthly') }}
    where entity = 'GROUP'
),

rolling as (
    select
        month,
        avg(ar_end_eur)     over t3 as avg_ar_3m,
        sum(revenue_eur)    over t3 as revenue_3m,
        sum(days_in_month)  over t3 as days_3m,
        count(*)            over t3 as months_in_window
    from wc
    window t3 as (order by month rows between 2 preceding and current row)
)

select
    wc.month,
    wc.revenue_eur,
    wc.ar_end_eur,
    case when r.months_in_window = 3
        then wc.ar_end_eur / nullif(wc.revenue_eur, 0) * wc.days_in_month
    end as dso_ending_balance,
    case when r.months_in_window = 3
        then r.avg_ar_3m / nullif(r.revenue_3m, 0) * r.days_3m
    end as dso_rolling_quarter,
    g.dso_countback
from wc
inner join rolling r on r.month = wc.month
inner join governed g on g.month = wc.month
