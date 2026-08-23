#!/usr/bin/env sh
# Vendors each project's interactive dashboard into public/.
#
# The dashboards are single self-contained HTML files that live in their own
# repositories, so serving them from this site costs one copy and no build step.
# A copy drifts, though, and a stale dashboard is worse than no dashboard --
# it shows a reader numbers the study has already corrected. Run this before a
# release, or whenever a source repository has published new results.
set -eu

cd "$(dirname "$0")/.."

status=0

sync() {
  repo="$1"
  dest="$2"
  url="https://raw.githubusercontent.com/morichtereur/$repo/main/dashboard.html"
  tmp="$(mktemp)"

  if ! curl -fsSL "$url" -o "$tmp"; then
    printf '  %-26s FAILED to fetch\n' "$dest"
    rm -f "$tmp"
    status=1
    return
  fi

  mkdir -p "public/$dest"
  if cmp -s "$tmp" "public/$dest/index.html" 2>/dev/null; then
    printf '  %-26s unchanged\n' "$dest"
    rm -f "$tmp"
  else
    mv "$tmp" "public/$dest/index.html"
    printf '  %-26s updated\n' "$dest"
  fi
}

echo "Syncing dashboards from their source repositories:"
sync gbs-location-selection location-dashboard
sync gbs-tom-assignment     tom-dashboard
sync gbs-agentic-shift      agentic-shift-dashboard

exit "$status"
