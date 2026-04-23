#!/usr/bin/env bash
# Smoke-test the timesheet sidecar API.
#
#   export BASE=https://timesheet.example.com
#   export AGENT_KEY=your-x-agent-key
#   bash docs/api-examples.sh
#
# For local dev:
#   export BASE=http://localhost:3000

set -euo pipefail

: "${BASE:?BASE env var is required, e.g. https://timesheet.example.com}"
: "${AGENT_KEY:?AGENT_KEY env var is required}"

echo "→ health (unauthenticated)"
curl -fsS "$BASE/api/health" | python3 -m json.tool
echo

echo "→ list employees"
curl -fsS -H "X-Agent-Key: $AGENT_KEY" "$BASE/api/employees" | python3 -m json.tool
echo

# Sunday of the current week (YYYY-MM-DD).
WEEK_START=$(python3 -c "import datetime as d; t=d.date.today(); print((t - d.timedelta(days=(t.weekday()+1)%7)).isoformat())")

# Pick the first employee's tabName.
TAB=$(curl -fsS -H "X-Agent-Key: $AGENT_KEY" "$BASE/api/employees" \
  | python3 -c "import sys,json; es=json.load(sys.stdin); print(es[0]['tabName'] if es else '')")

if [[ -z "$TAB" ]]; then
  echo "(no employees yet — add one via Settings in the app before continuing)"
  exit 0
fi

echo "→ hours for $TAB, week starting $WEEK_START"
curl -fsS -H "X-Agent-Key: $AGENT_KEY" \
  "$BASE/api/hours/$TAB?weekStart=$WEEK_START" | python3 -m json.tool
echo

echo "→ list weeks with data for $TAB"
curl -fsS -H "X-Agent-Key: $AGENT_KEY" "$BASE/api/weeks/$TAB" | python3 -m json.tool
echo

echo "→ POST a slot (dry run would be ideal but the API doesn't support it; commenting out)"
cat <<EOF
# Uncomment to test a real write:
# curl -fsS -X POST -H "X-Agent-Key: \$AGENT_KEY" -H "Content-Type: application/json" \\
#   "\$BASE/api/hours/\$TAB" \\
#   -d '[{"date":"2026-04-20","slotType":"work","start":"08:00","end":"16:00","hours":8,"notes":""}]'
EOF
