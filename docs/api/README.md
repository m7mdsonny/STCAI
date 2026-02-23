# API Specifications

## Overview

| API | Consumers | Auth | Purpose |
|-----|------------|------|---------|
| [Cloud Public API](openapi-cloud.yaml) | Mobile, Web | JWT (OTP) | Auth, tenants, sites, events, push, license |
| [Edge Sync API](edge-sync-api.md) | Edge devices | Device cert + API key | Config, event push, telemetry, license check |

## Standards

- REST with JSON; WebSocket for real-time where needed.
- All tenant-scoped URLs/responses include tenant context.
- Rate limits: per-tenant and per-user; documented in OpenAPI.
- Versioning: `/v1/` prefix; maintain backward compatibility.

## Key Endpoints (Summary)

### Auth
- `POST /v1/auth/otp/send` — send OTP to phone
- `POST /v1/auth/otp/verify` — verify OTP, return JWT
- `POST /v1/auth/refresh` — refresh JWT

### Tenant / Sites (JWT)
- `GET /v1/tenants/me` — current tenant
- `GET /v1/sites` — list sites (filtered by role)
- `GET /v1/sites/:id` — site detail + devices
- `POST /v1/sites/:id/arm` — arm site
- `POST /v1/sites/:id/disarm` — disarm site
- `POST /v1/sites/:id/siren` — remote siren trigger (if licensed)

### Events (JWT)
- `GET /v1/events` — list events (filters: site, type, from, to)
- `GET /v1/events/:id` — event detail + snapshot/clip URLs
- `POST /v1/events/:id/acknowledge` — acknowledge
- `POST /v1/events/:id/escalate` — escalate

### Edge Sync (Device cert + key)
- `POST /v1/sync/config` — get config for device
- `POST /v1/sync/events` — push events batch
- `POST /v1/sync/telemetry` — push telemetry
- `GET /v1/sync/license` — license check (trial/expiry/features)

See [openapi-cloud.yaml](openapi-cloud.yaml) for full request/response schemas.
