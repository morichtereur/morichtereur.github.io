#!/usr/bin/env sh
# End to end: extracts -> raw-file invariants -> dbt build (models + tests)
# -> dashboard. Any failing step stops the run, so a dashboard.html that
# exists is one whose every check passed.
set -eu
cd "$(dirname "$0")"

python3 generate_data.py
python3 -m pytest tests/ -q
DBT_PROFILES_DIR=. dbt build
python3 export_dashboard.py
