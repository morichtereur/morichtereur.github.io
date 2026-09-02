-- The consolidation a hurried analyst actually produces, kept as a model on
-- purpose. Concatenating the three extracts forces two fixes immediately,
-- because they crash: German dates will not parse and decimal commas will
-- not cast. So the naive pipeline fixes those. The two problems that do NOT
-- crash — złoty amounts that read as euros, and an extract loaded twice —
-- sail through and inflate revenue silently.
--
-- This model reproduces that pipeline faithfully: parse everything, convert
-- nothing, deduplicate nothing. The delta against the governed figure is
-- what the staging layer is worth, in euros per month.

with naive_union as (
    select
        cast(strptime(posting_date, '%d.%m.%Y') as date) as posting_date,
        trim(account)                                    as account,
        cast(replace(debit, ',', '.') as double)         as debit,
        cast(replace(credit, ',', '.') as double)        as credit
    from read_csv('data/raw/gl_DE01.csv', header = true, all_varchar = true)

    union all

    select
        cast(posting_date as date),
        trim(account),
        cast(debit as double),
        cast(credit as double)
    from read_csv('data/raw/gl_NL01.csv', header = true, all_varchar = true)

    union all

    select
        cast(posting_date as date),
        trim(account),
        cast(debit as double),
        cast(credit as double)
    from read_csv('data/raw/gl_PL01.csv', header = true, all_varchar = true)
),

naive_revenue as (
    select
        strftime(posting_date, '%Y-%m') as month,
        sum(credit - debit)             as naive_revenue
    from naive_union
    where account in ('4000', '4100')
    group by 1
),

governed_revenue as (
    select
        posting_month           as month,
        sum(credit_eur - debit_eur) as governed_revenue_eur
    from {{ ref('stg_gl_lines') }}
    where account in ('4000', '4100')
    group by 1
)

select
    n.month,
    n.naive_revenue,
    g.governed_revenue_eur,
    n.naive_revenue - g.governed_revenue_eur as overstatement_eur
from naive_revenue n
inner join governed_revenue g on g.month = n.month
