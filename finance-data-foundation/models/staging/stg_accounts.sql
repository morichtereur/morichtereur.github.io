-- The chart of accounts, with each account mapped once to a statement and a
-- line. Every P&L and working-capital figure downstream inherits this mapping
-- rather than re-asserting its own.

select
    trim(account) as account,
    account_name,
    statement,
    line
from read_csv('data/raw/chart_of_accounts.csv', header = true, all_varchar = true)
