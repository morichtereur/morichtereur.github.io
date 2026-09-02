-- Working capital with governed definitions, per entity and month, plus the
-- GROUP rollup. The definitions are the deliverable:
--
--   DSO — countback (exhaust the closing AR against the most recent months'
--         revenue, newest first, counting the days it covers). Robust to a
--         single month's spike, which is exactly why it is the governed one.
--   DIO — closing inventory over trailing-three-month COGS, times the days
--         in those three months.
--   DPO — closing payables over trailing-three-month purchases, likewise.
--   CCC — DSO + DIO − DPO.
--
-- Early months carry NULL ratios rather than a number computed on a partial
-- window: a figure that cannot be computed honestly is not computed.

with wc as (
    select * from {{ ref('int_wc_monthly') }}
),

-- Countback: join each month to its trailing twelve, and let month h
-- contribute its full day count while closing AR still exceeds the revenue
-- of every month newer than h, then a pro-rated fraction of the month that
-- exhausts it.
countback as (
    select
        m.entity,
        m.month,
        sum(
            h.days_in_month * least(1.0, greatest(0.0,
                (m.ar_end_eur - (m.cum_revenue_eur - h.cum_revenue_eur))
                / nullif(h.revenue_eur, 0)
            ))
        ) as dso_countback
    from wc m
    inner join wc h
        on h.entity = m.entity
        and h.month_idx between m.month_idx - 11 and m.month_idx
    group by 1, 2
),

t3win as (
    select
        entity,
        month,
        sum(cogs_eur)      over t3 as cogs_3m,
        sum(purchases_eur) over t3 as purchases_3m,
        sum(days_in_month) over t3 as days_3m,
        count(*)           over t3 as months_in_window
    from wc
    window t3 as (partition by entity order by month rows between 2 preceding and current row)
)

select
    wc.entity,
    wc.month,
    wc.revenue_eur,
    wc.cogs_eur,
    wc.ar_end_eur,
    wc.ap_end_eur,
    wc.inv_end_eur,
    case when t.months_in_window = 3 then cb.dso_countback end as dso,
    case when t.months_in_window = 3
        then wc.inv_end_eur / nullif(t.cogs_3m, 0) * t.days_3m end as dio,
    case when t.months_in_window = 3
        then wc.ap_end_eur / nullif(t.purchases_3m, 0) * t.days_3m end as dpo,
    case
        when t.months_in_window = 3
        then cb.dso_countback
            + wc.inv_end_eur / nullif(t.cogs_3m, 0) * t.days_3m
            - wc.ap_end_eur / nullif(t.purchases_3m, 0) * t.days_3m
    end as ccc
from wc
inner join countback cb on cb.entity = wc.entity and cb.month = wc.month
inner join t3win t on t.entity = wc.entity and t.month = wc.month
