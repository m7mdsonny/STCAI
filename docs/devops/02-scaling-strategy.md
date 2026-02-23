# Scaling Strategy

## 1. Scale Targets

| Scale | Sites | Edge Devices | Events/day (est.) | Cloud API RPS |
|-------|-------|--------------|-------------------|---------------|
| 100 sites | 100 | ~300 | ~50k | ~10 |
| 1,000 sites | 1,000 | ~3,000 | ~500k | ~100 |
| 10,000 sites | 10,000 | ~30,000 | ~5M | ~1,000 |

## 2. Edge Scaling (Per Site)

- **Single edge unit**: Handles N cameras (e.g. 4–16) depending on resolution and FPS; one GPU per unit.
- **Multi-unit per site**: Multiple edge devices per site; each has own device_id; cloud aggregates by site_id.
- **Horizontal**: No cross-edge dependency; add more sites = add more edge units.

## 3. Cloud Horizontal Scaling

| Component | Strategy |
|-----------|----------|
| API Gateway | Stateless; scale replicas behind LB |
| Auth | Stateless (JWT); scale replicas |
| Tenant / License | Stateless; DB connection pool; scale replicas |
| Event ingestion | Partition by tenant_id or site_id; scale consumers |
| Event store | PostgreSQL + time partitioning or TimescaleDB; read replicas for dashboards |
| Telemetry | Write to time-series store; scale writers |
| Push (FCM) | Scale notification workers; batch where possible |
| Analytics | Async jobs; queue-based; scale workers |

## 4. Database

- **Primary**: PostgreSQL; connection pooling (PgBouncer or RDS Proxy).
- **Read replicas**: For read-heavy (events list, dashboards); eventual consistency acceptable.
- **Partitioning**: `events` by `occurred_at` (e.g. monthly); optional TimescaleDB hypertable.
- **Tenant isolation**: All queries filter by tenant_id; indexes (tenant_id, time).

## 5. Caching

- **License cache**: Per-tenant in Redis; TTL 5 min; invalidate on license change.
- **Config cache**: Per-device config in Redis; TTL 60 s for sync.
- **JWT**: Stateless; no cache; short-lived access token.

## 6. Rate Limiting

- **Per tenant**: e.g. 1000 API req/min for read; 100/min for write.
- **Per device (sync)**: Per edge-sync-api.md (config 1/60s, events 10/min, etc.).
- **Per user**: OTP 3/hour per phone; login 10/min per phone.

## 7. Multi-Region (Future)

- **Data residency**: Deploy DB + API in region (e.g. Egypt, GCC); tenant assigned to region.
- **Sync endpoint**: Edge talks to same-region sync API; lower latency.
- **Global**: Single control plane for license and global ops; regional data stays in region.
