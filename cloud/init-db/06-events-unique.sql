-- Dedup: one row per (edge_device_id, event_id) for sync idempotency
CREATE UNIQUE INDEX IF NOT EXISTS events_edge_event_id_unique ON events(edge_device_id, event_id);
