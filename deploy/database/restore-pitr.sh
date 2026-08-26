#!/bin/bash
# Point-in-Time Recovery Script for docker-platform
# Restores PostgreSQL to a specific timestamp using WAL archiving
set -euo pipefail

# Configuration
DB_NAME="${PGDATABASE:-docker_platform}"
DB_USER="${PGUSER:-postgres}"
WAL_ARCHIVE="/var/lib/postgresql/wal_archive"
RESTORE_TARGET="$1"   # Format: '2026-08-26 10:30:00+00'

if [ -z "${RESTORE_TARGET}" ]; then
  echo "Usage: $0 <target-timestamp>"
  echo "Example: $0 '2026-08-26 10:30:00+00'"
  exit 1
fi

echo "=== Point-in-Time Recovery ==="
echo "Database: ${DB_NAME}"
echo "Target:   ${RESTORE_TARGET}"
echo ""

# Step 1: Stop PostgreSQL
echo "[1/6] Stopping PostgreSQL..."
sudo systemctl stop postgresql

# Step 2: Move current data directory
DATA_DIR=$(psql -t -P format=0 -c "SHOW data_directory" 2>/dev/null || echo "/var/lib/postgresql/16/main")
BACKUP_DATA="${DATA_DIR}.pre-pitr.$(date +%Y%m%d%H%M%S)"
echo "[2/6] Moving current data directory to ${BACKUP_DATA}..."
sudo mv "${DATA_DIR}" "${BACKUP_DATA}"

# Step 3: Restore from base backup
echo "[3/6] Restoring base backup..."
BASE_BACKUP=$(ls -t /opt/backups/postgres/${DB_NAME}_*.dump | head -1)
sudo mkdir -p "${DATA_DIR}"
sudo chown postgres:postgres "${DATA_DIR}"

# Step 4: Configure recovery
echo "[4/6] Configuring recovery mode..."
cat <<EOF | sudo tee "${DATA_DIR}/postgresql.auto.conf" > /dev/null
restore_command = 'cp ${WAL_ARCHIVE}/%f %p'
recovery_target_time = '${RESTORE_TARGET}'
recovery_target_action = 'promote'
EOF

sudo touch "${DATA_DIR}/recovery.signal"
sudo chown -R postgres:postgres "${DATA_DIR}"

# Step 5: Start PostgreSQL
echo "[5/6] Starting PostgreSQL in recovery mode..."
sudo systemctl start postgresql

# Step 6: Verify
echo "[6/6] Verifying recovery..."
sleep 5
CURRENT_TIME=$(psql -t -P format=0 -c "SELECT now()" 2>/dev/null)
echo "Current database time: ${CURRENT_TIME}"
echo ""
echo "=== Recovery complete ==="
echo "Check logs: /var/log/postgresql/postgresql-16-main.log"
echo "If satisfied, run: sudo rm ${DATA_DIR}/recovery.signal"
