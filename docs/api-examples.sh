#!/usr/bin/env bash
# Smoke-test the stateless timesheet sidecar API.
#
#   export BASE=https://<your-deploy>
#   export ACCESS_TOKEN=$(gcloud auth application-default print-access-token)
#   export SHEET_ID=<your-spreadsheet-id>
#   bash docs/api-examples.sh
#
# For local dev: export BASE=http://localhost:3000

set -euo pipefail

: "${BASE:?BASE env var is required, e.g. https://timesheet.example.com}"
: "${ACCESS_TOKEN:?ACCESS_TOKEN env var is required (Google OAuth bearer token)}"
: "${SHEET_ID:?SHEET_ID env var is required (spreadsheet id)}"

echo "→ health (no auth required)"
curl -fsS "$BASE/api/health" | python3 -m json.tool
echo

echo "→ list employees"
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE/api/employees?sheetId=$SHEET_ID" | python3 -m json.tool
echo

# Sunday of the current week (YYYY-MM-DD).
WEEK_START=$(python3 -c "import datetime as d; t=d.date.today(); print((t - d.timedelta(days=(t.weekday()+1)%7)).isoformat())")

# Pick the first employee's tabName.
TAB=$(curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE/api/employees?sheetId=$SHEET_ID" \
  | python3 -c "import sys,json; es=json.load(sys.stdin); print(es[0]['tabName'] if es else '')")

if [[ -z "$TAB" ]]; then
  echo "(no employees yet — add one via Settings in the app before continuing)"
  exit 0
fi

echo "→ hours for $TAB, week starting $WEEK_START"
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE/api/hours/$TAB?sheetId=$SHEET_ID&weekStart=$WEEK_START" | python3 -m json.tool
echo

echo "→ list weeks with data for $TAB"
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE/api/weeks/$TAB?sheetId=$SHEET_ID" | python3 -m json.tool
echo

cat <<'EOF'
# Uncomment to test a real write (upserts by date+slotType+start):
# curl -fsS -X POST \\
#   -H "Authorization: Bearer $ACCESS_TOKEN" \\
#   -H "Content-Type: application/json" \\
#   "$BASE/api/hours/$TAB?sheetId=$SHEET_ID" \\
#   -d '[{"date":"2026-04-20","slotType":"work","start":"08:00","end":"16:00","hours":8,"notes":""}]'
EOF
