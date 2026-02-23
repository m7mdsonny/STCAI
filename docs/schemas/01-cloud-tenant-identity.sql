-- =============================================================================
-- Cloud: Tenant & Identity (PostgreSQL)
-- Multi-tenant isolation; tenant_id on every tenant-scoped table.
-- =============================================================================

-- Tenants (companies)
CREATE TABLE tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,
  slug              VARCHAR(64) UNIQUE NOT NULL,
  region            VARCHAR(32) NOT NULL,  -- EGYPT, GCC, AFRICA, etc.
  tier              VARCHAR(32) NOT NULL,  -- BASIC, PROFESSIONAL, ENTERPRISE
  settings          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_region_tier ON tenants(region, tier);

-- Sites (factories/warehouses per tenant)
CREATE TABLE sites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  timezone          VARCHAR(64) NOT NULL DEFAULT 'UTC',
  address           TEXT,
  config            JSONB DEFAULT '{}',   -- arm schedule, escalation, etc.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sites_tenant ON sites(tenant_id);

-- Edge devices (one or more per site)
CREATE TABLE edge_devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  device_id         VARCHAR(128) UNIQUE NOT NULL,  -- hardware/activation id
  name              VARCHAR(255),
  version           VARCHAR(64),           -- firmware/agent version
  last_seen_at      TIMESTAMPTZ,
  status            VARCHAR(32) NOT NULL DEFAULT 'unknown',  -- online, offline, error
  config_snapshot   JSONB,                 -- last pushed config
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_edge_devices_device_id ON edge_devices(device_id);
CREATE INDEX idx_edge_devices_site ON edge_devices(site_id);
CREATE INDEX idx_edge_devices_tenant ON edge_devices(site_id) INCLUDE (id);  -- via site.tenant_id in app

-- Users (phone-based; max 5 per license enforced in app)
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone             VARCHAR(32) NOT NULL,
  role              VARCHAR(32) NOT NULL,  -- admin, security, manager, viewer
  display_name      VARCHAR(255),
  fcm_token         VARCHAR(512),          -- for push
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_phone ON users(phone);

-- Which sites a user can access (optional; if empty for role, all sites)
CREATE TABLE user_site_access (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, site_id)
);

CREATE INDEX idx_user_site_access_site ON user_site_access(site_id);

-- Device binding for mobile (optional: bind device to user for extra security)
CREATE TABLE user_devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint VARCHAR(256) NOT NULL,
  name              VARCHAR(128),
  last_used_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX idx_user_devices_user ON user_devices(user_id);
