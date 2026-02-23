# Monitoring, Logging & Disaster Recovery

## 1. Monitoring (Prometheus + Grafana)

### Metrics

| Metric | Source | Use |
|--------|--------|-----|
| API latency (p50, p95, p99) | Gateway / app | SLO |
| API error rate by code | Gateway | Alerts |
| Event ingestion rate | Event service | Throughput |
| Event ingestion latency | Event service | Sync health |
| DB connections, replication lag | PostgreSQL | Capacity |
| License check rate, 403 rate | License service | Business |
| Edge telemetry: inference_ms, cpu, memory | Telemetry service | Edge health |
| Push delivery rate | Notification service | UX |

### Alerts

- API p99 > 1 s for 5 min.
- Error rate > 1% for 5 min.
- DB replication lag > 30 s.
- Event queue depth > 10k (if queue used).
- License 403 spike (possible misconfiguration).

### Dashboards

- **Operations**: Request rate, latency, errors per service.
- **Business**: Active sites, events/day, license states.
- **Edge**: Device online %, inference latency distribution.

## 2. Logging

- **Centralized**: All cloud services → central log store (e.g. Loki, Elasticsearch, CloudWatch).
- **Structured**: JSON; fields: timestamp, level, service, tenant_id (if present), request_id, message.
- **Retention**: 30 days hot; 1 year cold (compliance); no PII in logs where possible.
- **Edge**: Local rotate (e.g. 7 days); optional forward to cloud for support (opt-in).

## 3. Disaster Recovery

### RTO / RPO Targets

| Item | RTO | RPO |
|------|-----|-----|
| API + Auth | 4 h | 0 (no durable state in app) |
| Event ingestion | 4 h | 1 h (queue retention) |
| Tenant/Event DB | 4 h | 1 h (replication) |
| Edge | N/A (distributed) | Local only |

### Backup

- **DB**: Automated daily snapshots; point-in-time recovery (PITR) if supported; backups in another region.
- **Secrets**: Vault/KMS backup or replication per vendor best practice.
- **Config**: Infra as code (Terraform/K8s) in repo; reproducible.

### Recovery Procedure

1. Restore DB from latest snapshot or PITR.
2. Redeploy services from last known good image.
3. Verify auth and license; verify event ingestion.
4. Notify tenants if extended outage; status page.

### Edge

- Edge operates offline; no DR for “cloud down” beyond sync backlog.
- After cloud restore, edge syncs backlog (events, telemetry); idempotency by event_id.
