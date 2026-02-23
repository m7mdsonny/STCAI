#!/bin/bash
set -e
# Run cloud schemas in order (tenant+identity, license, events)
psql -v ON_ERROR_STOP=1 -U riskintel -d riskintel -f /docker-entrypoint-initdb.d/01-tenant.sql
psql -v ON_ERROR_STOP=1 -U riskintel -d riskintel -f /docker-entrypoint-initdb.d/02-license.sql
psql -v ON_ERROR_STOP=1 -U riskintel -d riskintel -f /docker-entrypoint-initdb.d/03-events.sql
psql -v ON_ERROR_STOP=1 -U riskintel -d riskintel -f /docker-entrypoint-initdb.d/04-seed.sql
psql -v ON_ERROR_STOP=1 -U riskintel -d riskintel -f /docker-entrypoint-initdb.d/05-edge-api-key.sql
psql -v ON_ERROR_STOP=1 -U riskintel -d riskintel -f /docker-entrypoint-initdb.d/06-events-unique.sql
