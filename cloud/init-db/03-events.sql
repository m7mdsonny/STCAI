-- Cloud: Events & Analytics (see docs/schemas/03-cloud-events-analytics.sql)
CREATE TABLE IF NOT EXISTS events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  site_id           UUID NOT NULL,
  edge_device_id    UUID NOT NULL,
  event_id          VARCHAR(64) NOT NULL,
  type              VARCHAR(64) NOT NULL,
  priority          VARCHAR(16) NOT NULL,
  risk_score        NUMERIC(5,2),
  camera_id         VARCHAR(64),
  zone_id           VARCHAR(64),
  snapshot_url      TEXT,
  clip_url          TEXT,
  payload           JSONB,
  occurred_at       TIMESTAMPTZ NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID,
  escalated_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_events_tenant_occurred ON events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_site_occurred ON events(site_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_edge_dedup ON events(edge_device_id, event_id);
CREATE INDEX IF NOT EXISTS idx_events_type_occurred ON events(type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS site_risk_daily (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  site_id           UUID NOT NULL,
  date              DATE NOT NULL,
  risk_score        NUMERIC(5,2) NOT NULL,
  event_count       INT NOT NULL DEFAULT 0,
  critical_count    INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id, date)
);
CREATE INDEX IF NOT EXISTS idx_site_risk_daily_tenant_date ON site_risk_daily(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_site_risk_daily_site ON site_risk_daily(site_id, date DESC);

CREATE TABLE IF NOT EXISTS device_telemetry (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_device_id    UUID NOT NULL,
  tenant_id         UUID NOT NULL,
  reported_at       TIMESTAMPTZ NOT NULL,
  cpu_percent       NUMERIC(5,2),
  memory_mb         INT,
  inference_ms_p50  INT,
  inference_ms_p99  INT,
  model_version     VARCHAR(64),
  uptime_seconds    BIGINT,
  payload           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_device_time ON device_telemetry(edge_device_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_tenant_time ON device_telemetry(tenant_id, reported_at DESC);
