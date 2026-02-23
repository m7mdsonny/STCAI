-- =============================================================================
-- Cloud: License (PostgreSQL)
-- Activation, trial, expiry, feature flags, device binding.
-- =============================================================================

CREATE TABLE licenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tier              VARCHAR(32) NOT NULL,  -- BASIC, PROFESSIONAL, ENTERPRISE
  activation_key    VARCHAR(64) UNIQUE,     -- optional; for paid activation
  state             VARCHAR(32) NOT NULL DEFAULT 'trial',  -- trial, active, expired, revoked
  trial_ends_at     TIMESTAMPTZ,            -- for trial
  expires_at        TIMESTAMPTZ,            -- for subscription
  max_devices       INT NOT NULL DEFAULT 5,
  max_phones        INT NOT NULL DEFAULT 5,
  feature_flags     JSONB DEFAULT '{}',    -- fire, theft, multi_site, erp, insurance_report
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_licenses_tenant ON licenses(tenant_id);
CREATE INDEX idx_licenses_activation_key ON licenses(activation_key) WHERE activation_key IS NOT NULL;
CREATE INDEX idx_licenses_state_expires ON licenses(state, expires_at);

-- Device activation (edge device_id bound to this license)
CREATE TABLE license_devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id        UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  device_id         VARCHAR(128) NOT NULL,
  activated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_check_at     TIMESTAMPTZ,
  UNIQUE(license_id, device_id)
);

CREATE INDEX idx_license_devices_license ON license_devices(license_id);
CREATE UNIQUE INDEX idx_license_devices_device_id ON license_devices(device_id);

-- Activation key pool (pre-generated keys for sales/channel)
CREATE TABLE activation_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_code          VARCHAR(64) UNIQUE NOT NULL,
  tier              VARCHAR(32) NOT NULL,
  max_devices       INT NOT NULL,
  max_phones        INT NOT NULL,
  feature_flags     JSONB DEFAULT '{}',
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until       TIMESTAMPTZ,
  used_at           TIMESTAMPTZ,
  tenant_id         UUID REFERENCES tenants(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_activation_keys_code ON activation_keys(key_code);
CREATE INDEX idx_activation_keys_unused ON activation_keys(key_code) WHERE used_at IS NULL;
