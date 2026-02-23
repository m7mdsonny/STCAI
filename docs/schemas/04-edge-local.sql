-- =============================================================================
-- Edge: Local SQLite (encrypted at rest)
-- Clips, snapshots, events, audit. Signed timestamps; rotation policy.
-- =============================================================================

-- Schema version (for migrations)
CREATE TABLE IF NOT EXISTS schema_version (
  version INT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- Local config cache (from cloud)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value BLOB NOT NULL,
  updated_at TEXT NOT NULL
);

-- License cache (trial end, features; verified when online)
CREATE TABLE IF NOT EXISTS license_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tier TEXT NOT NULL,
  trial_ends_at TEXT,
  expires_at TEXT,
  feature_flags TEXT NOT NULL,  -- JSON
  last_verified_at TEXT,
  updated_at TEXT NOT NULL
);

-- Events (local copy for sync queue and replay)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  priority TEXT NOT NULL,
  risk_score REAL,
  camera_id TEXT,
  zone_id TEXT,
  snapshot_path TEXT,
  clip_path TEXT,
  payload TEXT,  -- JSON
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced_at TEXT,
  signed_at TEXT  -- signed timestamp for tamper evidence
);

CREATE INDEX idx_events_occurred ON events(occurred_at);
CREATE INDEX idx_events_synced ON events(synced_at) WHERE synced_at IS NULL;

-- Snapshots (path on disk; metadata here)
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX idx_snapshots_event ON snapshots(event_id);

-- Clips (path; rotation deletes oldest by policy)
CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  path TEXT NOT NULL,
  duration_sec INT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX idx_clips_created ON clips(created_at);

-- Audit log (immutable; relay control, arm/disarm, config change)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor TEXT,  -- local | cloud | user_id
  details TEXT,  -- JSON
  created_at TEXT NOT NULL,
  signature TEXT  -- optional HMAC for integrity
);

CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- Hardware actions (for latency tracking and audit)
CREATE TABLE IF NOT EXISTS hardware_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  action_type TEXT NOT NULL,  -- siren_on, relay_1_on, etc.
  triggered_at TEXT NOT NULL,
  latency_ms INT,
  success INT NOT NULL,  -- 0/1
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX idx_hardware_actions_triggered ON hardware_actions(triggered_at);
