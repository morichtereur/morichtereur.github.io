-- The payables subledger ties to the 2100 control account at every
-- month-end, per entity, in document currency.

with month_ends as (
    select distinct
        entity,
        posting_month as month,
        last_day(cast(strptime(posting_month || '-01', '%Y-%m-%d') as date)) as eom
    from {{ ref('stg_gl_lines') }}
),

gl_balance as (
    select
        m.entity,
        m.month,
        coalesce(sum(g.credit_dc - g.debit_dc), 0) as gl_ap_dc
    from month_ends m
    left join {{ ref('stg_gl_lines') }} g
        on g.entity = m.entity
        and g.account = '2100'
        and g.posting_date <= m.eom
    group by 1, 2
),

subledger_open as (
    select
        m.entity,
        m.month,
        coalesce(sum(a.amount_dc), 0) as open_ap_dc
    from month_ends m
    left join {{ ref('stg_ap_invoices') }} a
        on a.entity = m.entity
        and a.issue_date <= m.eom
        and (a.paid_date is null or a.paid_date > m.eom)
    group by 1, 2
)

select
    g.entity,
    g.month,
    g.gl_ap_dc,
    s.open_ap_dc,
    g.gl_ap_dc - s.open_ap_dc as difference
from gl_balance g
inner join subledger_open s on s.entity = g.entity and s.month = g.month
where abs(g.gl_ap_dc - s.open_ap_dc) > 0.02
