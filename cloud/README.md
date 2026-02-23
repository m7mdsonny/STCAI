# Cloud SaaS

- **api/** — API gateway + auth, tenant, license, event, notify (Go/Chi). Start here.
- **sync/** — (TBD) Edge sync endpoint: config, events, telemetry, license (TLS client cert).
- **migrations/** — (TBD) DB migrations (e.g. golang-migrate); use `docs/schemas/*.sql` as base.

Run locally with Docker Compose:
```bash
cp .env.example .env
# Optional: chmod +x init-db/00-run-schemas.sh  (Linux/Mac)
docker compose up -d db redis
# DB is auto-initialized from init-db/ (01-tenant, 02-license, 03-events)
docker compose up api
```

API base: http://localhost:8080/v1 — see `docs/api/openapi-cloud.yaml`.
