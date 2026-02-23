#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +"%Y%m%d-%H%M%S")
mkdir -p backups

docker compose exec -T db pg_dump -U vvpp -d vvpp_a2 > "backups/db-${STAMP}.sql"
docker compose cp minio:/data "backups/minio-${STAMP}" || true

echo "Backup complete: backups/db-${STAMP}.sql and minio-${STAMP}/"
