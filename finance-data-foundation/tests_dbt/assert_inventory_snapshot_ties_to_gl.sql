-- The warehouse's own month-end inventory snapshot agrees with the 1300
-- balance the ledger carries, per entity and month, in document currency.
-- Two independent systems, one number.

with gl_balance as (
    select
        entity,
        posting_month as month,
        sum(sum(case when account = '1300' then debit_dc - credit_dc else 0 end))
            over (partition by entity order by posting_month
                  rows between unbounded preceding and current row) as gl_inv_dc
    from {{ ref('stg_gl_lines') }}
    group by entity, posting_month
),

snapshot as (
    select
        entity,
        month,
        cast(closing_value as double) as snapshot_dc
    from read_csv('data/raw/inventory_snapshots.csv', header = true, all_varchar = true)
)

select
    g.entity,
    g.month,
    g.gl_inv_dc,
    s.snapshot_dc,
    g.gl_inv_dc - s.snapshot_dc as difference
from gl_balance g
inner join snapshot s on s.entity = g.entity and s.month = g.month
where abs(g.gl_inv_dc - s.snapshot_dc) > 0.05
