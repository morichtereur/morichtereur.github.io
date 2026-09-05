-- The monthly P&L, long format: one row per entity, month and statement
-- line, in EUR. The line an account belongs to is decided once, in the
-- chart of accounts — no report downstream re-maps an account for itself.

with gl as (
    select * from {{ ref('stg_gl_lines') }}
),

acc as (
    select * from {{ ref('stg_accounts') }}
)

select
    gl.entity,
    gl.posting_month as month,
    acc.line,
    sum(
        case
            when acc.line = 'revenue' then gl.credit_eur - gl.debit_eur
            else gl.debit_eur - gl.credit_eur
        end
    ) as amount_eur
from gl
inner join acc on acc.account = gl.account
where acc.statement = 'PL'
group by 1, 2, 3
