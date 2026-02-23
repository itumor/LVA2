#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: scripts/restore.sh <db-sql-file>"
  exit 1
fi

docker compose exec -T db psql -U vvpp -d vvpp_a2 < "$1"

echo "Database restore complete"
