-- One governed view of the general ledger, from three extracts that disagree
-- about everything except being CSVs. DE01 writes DD.MM.YYYY and decimal
-- commas; PL01 posts in złoty and pads its account codes; DE01's March 2025
-- export ran twice. Everything downstream reads this model and nothing reads
-- the raw files, which is the entire point of a staging layer.

with de as (
    select
        doc_id,
        cast(line_no as integer)                          as line_no,
        cast(strptime(posting_date, '%d.%m.%Y') as date)  as posting_date,
        trim(account)                                     as account,
        cast(replace(debit, ',', '.') as double)          as debit_dc,
        cast(replace(credit, ',', '.') as double)         as credit_dc,
        currency,
        partner_id,
        'DE01'                                            as entity
    from read_csv('data/raw/gl_DE01.csv', header = true, all_varchar = true)
),

nl as (
    select
        doc_id,
        cast(line_no as integer)        as line_no,
        cast(posting_date as date)      as posting_date,
        trim(account)                   as account,
        cast(debit as double)           as debit_dc,
        cast(credit as double)          as credit_dc,
        currency,
        partner_id,
        'NL01'                          as entity
    from read_csv('data/raw/gl_NL01.csv', header = true, all_varchar = true)
),

pl as (
    select
        doc_id,
        cast(line_no as integer)        as line_no,
        cast(posting_date as date)      as posting_date,
        trim(account)                   as account,
        cast(debit as double)           as debit_dc,
        cast(credit as double)          as credit_dc,
        currency,
        partner_id,
        'PL01'                          as entity
    from read_csv('data/raw/gl_PL01.csv', header = true, all_varchar = true)
),

unioned as (
    select * from de
    union all
    select * from nl
    union all
    select * from pl
),

-- The doubled March 2025 extract produces rows that are identical in every
-- column, so exact-duplicate removal is the correct repair — and the
-- uniqueness test on (entity, doc_id, line_no) proves nothing survived it.
deduplicated as (
    select distinct * from unioned
),

fx as (
    select
        month,
        currency,
        cast(rate_to_eur as double) as rate_to_eur
    from read_csv('data/raw/fx_rates.csv', header = true, all_varchar = true)
)

select
    d.entity,
    d.doc_id,
    d.line_no,
    d.posting_date,
    strftime(d.posting_date, '%Y-%m')          as posting_month,
    d.account,
    d.partner_id,
    d.currency,
    d.debit_dc,
    d.credit_dc,
    d.debit_dc / coalesce(f.rate_to_eur, 1.0)  as debit_eur,
    d.credit_dc / coalesce(f.rate_to_eur, 1.0) as credit_eur
from deduplicated d
left join fx f
    on f.currency = d.currency
    and f.month = strftime(d.posting_date, '%Y-%m')
