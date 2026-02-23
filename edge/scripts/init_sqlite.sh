#!/bin/sh
# Initialize edge local SQLite DB from docs/schemas/04-edge-local.sql
# Usage: from repo root: sqlite3 edge/data/riskintel.db < docs/schemas/04-edge-local.sql

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DB_PATH="${EDGE_DB_PATH:-$REPO_ROOT/edge/data/riskintel.db}"
mkdir -p "$(dirname "$DB_PATH")"
sqlite3 "$DB_PATH" < "$REPO_ROOT/docs/schemas/04-edge-local.sql"
echo "Initialized $DB_PATH"
