# Database Schemas

Production-grade schemas for multi-tenant SaaS and edge local store.

## Overview

| Schema | Scope | DB | Purpose |
|--------|--------|-----|---------|
| [Cloud - Tenant & Identity](01-cloud-tenant-identity.sql) | Cloud | PostgreSQL | Tenants, users, sites, devices, roles |
| [Cloud - License](02-cloud-license.sql) | Cloud | PostgreSQL | Licenses, activation, trials, feature flags |
| [Cloud - Events & Analytics](03-cloud-events-analytics.sql) | Cloud | PostgreSQL + TimescaleDB | Events, risk scores, telemetry |
| [Edge - Local](04-edge-local.sql) | Edge | SQLite (encrypted) | Clips, snapshots, events, audit |

## Conventions

- All cloud tables include `tenant_id` (except global lookup tables).
- All tables use `id` UUID primary key, `created_at`, and where relevant `updated_at`.
- Soft delete via `deleted_at` where required.
- Indexes support tenant-scoped queries and time-range scans.
