# Master Deliverables Index

Production-grade design for the **Industrial AI Risk Intelligence Platform**. Use this index to navigate all artifacts.

---

## Architecture

| Document | Description |
|----------|-------------|
| [01-global-system-architecture.md](architecture/01-global-system-architecture.md) | System context, global data flow, deployment topology, edge/cloud/mobile stacks |
| [02-cloud-saas-architecture.md](architecture/02-cloud-saas-architecture.md) | Multi-tenant model, microservices map, license high-level |
| [03-event-flow-diagram.md](architecture/03-event-flow-diagram.md) | Event flow edge→cloud→mobile; edge internal path; license check; OTP login |

---

## Database Schemas

| Document | Description |
|----------|-------------|
| [schemas/README.md](schemas/README.md) | Schema overview and conventions |
| [01-cloud-tenant-identity.sql](schemas/01-cloud-tenant-identity.sql) | Tenants, sites, edge_devices, users, user_site_access, user_devices |
| [02-cloud-license.sql](schemas/02-cloud-license.sql) | Licenses, license_devices, activation_keys |
| [03-cloud-events-analytics.sql](schemas/03-cloud-events-analytics.sql) | events, site_risk_daily, device_telemetry |
| [04-edge-local.sql](schemas/04-edge-local.sql) | Edge SQLite: config, license_cache, events, snapshots, clips, audit_log, hardware_actions |

---

## API Specifications

| Document | Description |
|----------|-------------|
| [api/README.md](api/README.md) | API overview and standards |
| [openapi-cloud.yaml](api/openapi-cloud.yaml) | OpenAPI 3.0 for Cloud (auth, tenants, sites, events, license) |
| [edge-sync-api.md](api/edge-sync-api.md) | Edge sync: config, events, telemetry, license (device cert + key) |

---

## Security

| Document | Description |
|----------|-------------|
| [01-threat-model.md](security/01-threat-model.md) | Assets, trust boundaries, threat actors, mitigations, controls, license anti-tamper |
| [02-license-engine.md](security/02-license-engine.md) | License states, trial rules, activation, feature flags, expiry, edge check flow |
| [03-provisioning-onboarding.md](security/03-provisioning-onboarding.md) | Edge device provisioning, activation bundle, device ID, revocation, bootstrap UI |

---

## Edge

| Document | Description |
|----------|-------------|
| [01-edge-core-spec.md](edge/01-edge-core-spec.md) | Pipeline; video ingestion (Rust); AI inference (Python/ONNX); event engine; hardware; local store; sync |
| [02-ai-modules.md](edge/02-ai-modules.md) | Fire/smoke and anti-theft modules; tuning; model delivery |
| [03-hardware-automation.md](edge/03-hardware-automation.md) | <500 ms budget; relay/MQTT/Modbus/GSM; command set; safety; audit |

---

## Mobile

| Document | Description |
|----------|-------------|
| [01-mobile-app-spec.md](mobile/01-mobile-app-spec.md) | Flutter; OTP; multi-site; push; events; ack; escalate; siren; arm/disarm; security; offline |

---

## DevOps & Scaling

| Document | Description |
|----------|-------------|
| [01-ci-cd-pipeline.md](devops/01-ci-cd-pipeline.md) | Edge, cloud, mobile CI/CD; environments; secrets |
| [02-scaling-strategy.md](devops/02-scaling-strategy.md) | 100 / 1k / 10k sites; edge and cloud horizontal scaling; DB; cache; rate limits |
| [03-monitoring-logging-dr.md](devops/03-monitoring-logging-dr.md) | Prometheus/Grafana; alerts; logging; RTO/RPO; backup; recovery |
| [04-cost-optimization.md](devops/04-cost-optimization.md) | Cloud levers; edge cost; scaling cost; margin; checklist |

---

## Business

| Document | Description |
|----------|-------------|
| [01-business-model-tiers-pricing.md](business/01-business-model-tiers-pricing.md) | Basic / Professional / Enterprise; revenue streams; pricing Egypt, GCC, Africa; unit economics |
| [02-go-to-market-competitive.md](business/02-go-to-market-competitive.md) | Segments; pain points; sales process; 14-day demo; insurance; channels; case studies; vs Hikvision/Dahua/fire/CCTV |
| [03-investor-structure.md](business/03-investor-structure.md) | Market size; 3-year revenue; unit economics; margins; scaling cost; exit; tech moat; barriers |
| [04-12-month-roadmap.md](business/04-12-month-roadmap.md) | Q1–Q4: Edge MVP, pilots, SaaS, mobile, paid clients, analytics, scaling; hiring; budget; revenue targets |
| [05-brand-positioning.md](business/05-brand-positioning.md) | Positioning statement; key messages; tone; audience; naming/tagline |
| [06-advanced-intelligence.md](business/06-advanced-intelligence.md) | Daily risk; anomaly; timeline replay; heatmap; insurance report; ERP API; model update; telemetry; predictive trend |

---

## Codebase (Implementable)

| Path | Description |
|------|-------------|
| **edge/ingestion/** | Rust RTSP ingestion: `Cargo.toml`, `src/main.rs`, `config.example.json`, `Dockerfile` |
| **edge/inference/** | Python ONNX worker: `requirements.txt`, `inference_worker.py` |
| **edge/event_engine/** | Python event engine stub: `engine.py` (multi-frame, risk, dedup, hardware trigger) |
| **edge/sync/** | Rust sync client: `Cargo.toml`, `src/lib.rs`, `src/main.rs` (config, license, events, telemetry) |
| **edge/README.md** | Edge build and run instructions |
| **cloud/init-db/** | Postgres init: `00-run-schemas.sh`, `01-tenant.sql`, `02-license.sql`, `03-events.sql` |
| **cloud/init-db/04-seed.sql** | Seed: demo tenant, site, user, license, edge device |
| **cloud/api/** | Go API: `go.mod`, `cmd/api/main.go`, `internal/db/db.go`, `internal/handlers/handlers.go`, `internal/handlers/sync.go`, `Dockerfile` |
| **cloud/docker-compose.yml** | Local dev: api, postgres (auto-init + seed), redis |
| **cloud/.env.example** | Env vars for cloud |
| **mobile/** | Flutter: `pubspec.yaml`, `lib/main.dart`, `lib/api/client.dart` (+ getLicenseStatus), `lib/auth/auth_service.dart`, `lib/screens/*.dart`; main tabs show license bar |
| **scripts/** | `run-cloud-dev.ps1` (Windows), `README.md` (run instructions + seed) |
| **.github/workflows/** | `edge.yml` (Rust CI + Docker), `cloud.yml` (Go CI + Docker) |

---

## Design Principles Applied

- **Edge AI only** for detection; no video to cloud for inference.
- **Offline-first** edge; 14-day trial without internet.
- **< 500 ms** local siren path; latency budget and audit.
- **Multi-tenant** SaaS with tenant_id isolation and license engine.
- **OTP + JWT**; max 5 phones per license; device binding optional.
- **Production-grade**: schemas, APIs, threat model, DR, scaling to 10k sites.

All artifacts are in the repo under `docs/` and code under `edge/`, `cloud/`, `mobile/`.
