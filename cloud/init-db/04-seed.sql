-- Seed data for development (one tenant, one site, one user, one license).
-- Uses fixed UUIDs so references are stable.

INSERT INTO tenants (id, name, slug, region, tier, settings)
VALUES (
  'a0000001-0001-0000-0000-000000000001',
  'Demo Company',
  'demo',
  'EGYPT',
  'PROFESSIONAL',
  '{}'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO sites (id, tenant_id, name, timezone, address, config)
VALUES (
  'b0000001-0001-0000-0000-000000000001',
  'a0000001-0001-0000-0000-000000000001',
  'Factory Alpha',
  'Africa/Cairo',
  'Cairo, Egypt',
  '{"armed": false}'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, tenant_id, phone, role, display_name)
VALUES (
  'c0000001-0001-0000-0000-000000000001',
  'a0000001-0001-0000-0000-000000000001',
  '+201012345678',
  'admin',
  'Demo Admin'
) ON CONFLICT (tenant_id, phone) DO NOTHING;

INSERT INTO licenses (id, tenant_id, tier, state, trial_ends_at, expires_at, max_devices, max_phones, feature_flags)
VALUES (
  'd0000001-0001-0000-0000-000000000001',
  'a0000001-0001-0000-0000-000000000001',
  'PROFESSIONAL',
  'trial',
  now() + interval '14 days',
  NULL,
  10,
  5,
  '{"fire": true, "theft": true}'
) ON CONFLICT (tenant_id) DO NOTHING;

-- Optional: one edge device for sync testing
INSERT INTO edge_devices (id, site_id, device_id, name, status)
VALUES (
  'e0000001-0001-0000-0000-000000000001',
  'b0000001-0001-0000-0000-000000000001',
  'EDGE-001',
  'Edge 1',
  'online'
) ON CONFLICT (device_id) DO NOTHING;
