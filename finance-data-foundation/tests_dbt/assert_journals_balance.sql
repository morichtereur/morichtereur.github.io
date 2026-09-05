-- Every journal document balances in its own currency. A row here is a
-- document whose debits and credits disagree by more than half a cent —
-- which would mean the staging layer bent an amount while parsing it.

select
    entity,
    doc_id,
    sum(debit_dc) - sum(credit_dc) as imbalance
from {{ ref('stg_gl_lines') }}
group by entity, doc_id
having abs(sum(debit_dc) - sum(credit_dc)) > 0.005
