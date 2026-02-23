-- Allow edge devices to authenticate with API key (sync).
ALTER TABLE edge_devices ADD COLUMN IF NOT EXISTS api_key VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS idx_edge_devices_api_key ON edge_devices(api_key) WHERE api_key IS NOT NULL;

-- Seed device key for development
UPDATE edge_devices SET api_key = 'dev-key' WHERE device_id = 'EDGE-001';
