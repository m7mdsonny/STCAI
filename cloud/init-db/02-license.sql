-- Cloud: License (see docs/schemas/02-cloud-license.sql)
CREATE TABLE IF NOT EXISTS licenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tier              VARCHAR(32) NOT NULL,
  activation_key    VARCHAR(64) UNIQUE,
  state             VARCHAR(32) NOT NULL DEFAULT 'trial',
  trial_ends_at     TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  max_devices       INT NOT NULL DEFAULT 5,
  max_phones        INT NOT NULL DEFAULT 5,
  feature_flags     JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_tenant ON licenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_licenses_activation_key ON licenses(activation_key) WHERE activation_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_licenses_state_expires ON licenses(state, expires_at);

CREATE TABLE IF NOT EXISTS license_devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id        UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  device_id         VARCHAR(128) NOT NULL,
  activated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_check_at     TIMESTAMPTZ,
  UNIQUE(license_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_license_devices_license ON license_devices(license_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_license_devices_device_id ON license_devices(device_id);

CREATE TABLE IF NOT EXISTS activation_keys (
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_activation_keys_code ON activation_keys(key_code);
CREATE INDEX IF NOT EXISTS idx_activation_keys_unused ON activation_keys(key_code) WHERE used_at IS NULL;
