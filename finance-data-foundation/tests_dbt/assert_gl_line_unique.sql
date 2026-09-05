-- (entity, doc_id, line_no) appears exactly once after staging. This is the
-- test that proves the doubled DE01 March 2025 extract was actually removed:
-- run it against the raw union instead and it fails on every duplicated line.

select
    entity,
    doc_id,
    line_no,
    count(*) as occurrences
from {{ ref('stg_gl_lines') }}
group by entity, doc_id, line_no
having count(*) > 1
