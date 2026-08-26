#!/bin/bash
# PostgreSQL Backup Script for docker-platform
# Schedule via cron: 0 2 * * * /opt/backups/pg-backup.sh
set -euo pipefail

# Configuration
BACKUP_DIR="/opt/backups/postgres"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_NAME="${PGDATABASE:-docker_platform}"
DB_USER="${PGUSER:-postgres}"
RETENTION_DAYS=30
S3_BUCKET=""          # optional: set for remote backup
ENCRYPTION_KEY=""     # optional: set for encryption

# Date-based naming
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz"

echo "[$(date)] Starting backup of ${DB_NAME}..."

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Run pg_dump with compression
pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=custom \
  --compress=9 \
  --verbose \
  --file="${BACKUP_FILE}.dump"

# Also create SQL dump for easy restore
pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-owner \
  --no-privileges \
  -Fp \
  | gzip > "${BACKUP_FILE}"

echo "[$(date)] Backup created: ${BACKUP_FILE}"

# Upload to S3 if configured
if [ -n "${S3_BUCKET}" ]; then
  echo "[$(date)] Uploading to s3://${S3_BUCKET}/backups/..."
  aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/backups/${DB_NAME}/${DATE}/" --storage-class STANDARD_IA
  aws s3 cp "${BACKUP_FILE}.dump" "s3://${S3_BUCKET}/backups/${DB_NAME}/${DATE}/" --storage-class STANDARD_IA
  echo "[$(date)] S3 upload complete"
fi

# Clean up old backups locally
find "${BACKUP_DIR}" -name "${DB_NAME}_*" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Cleaned up backups older than ${RETENTION_DAYS} days"

# Clean up old S3 backups
if [ -n "${S3_BUCKET}" ]; then
  CUTOFF=$(date -d "-${RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y-%m-%d)
  aws s3 ls "s3://${S3_BUCKET}/backups/${DB_NAME}/" | while read -r line; do
    DIR_DATE=$(echo "$line" | awk '{print $2}' | sed 's|/||')
    if [[ "$DIR_DATE" < "$CUTOFF" ]]; then
      aws s3 rm "s3://${S3_BUCKET}/backups/${DB_NAME}/${DIR_DATE}/" --recursive
      echo "[$(date)] Removed old S3 backup: ${DIR_DATE}"
    fi
  done
fi

# Verify backup integrity
if [ -f "${BACKUP_FILE}" ]; then
  FILE_SIZE=$(stat -f%z "${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_FILE}")
  echo "[$(date)] Backup size: ${FILE_SIZE} bytes"
else
  echo "[$(date)] ERROR: Backup file not found!"
  exit 1
fi

echo "[$(date)] Backup completed successfully"
