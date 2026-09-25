#!/usr/bin/env bash
# Stops everything start.sh launched, using the process-group ids it
# recorded (never name matching, which can hit unrelated processes).
source "$(dirname "$0")/env.sh"
PIDS="$E2E_LOGS/pids"
[[ -f "$PIDS" ]] || exit 0
while read -r pid; do
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
done < "$PIDS"
sleep 1
while read -r pid; do kill -KILL -- "-$pid" 2>/dev/null; done < "$PIDS"
rm -f "$PIDS"
exit 0
