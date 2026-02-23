# Edge Sync API

Edge devices authenticate with **device certificate** (TLS client auth) plus **API key** (header). Cloud identifies device → site → tenant from `device_id` and returns tenant-scoped config and accepts events/telemetry.

## Base URL

- Production: `https://sync.riskintel.example.com/v1`
- All requests over TLS 1.2+; certificate pinning recommended on edge.

## Authentication

- **TLS client certificate**: issued during provisioning; CN or SAN = device_id.
- **Header**: `X-Device-Key: <api_key>` (per-device key, stored securely on edge).
- Cloud validates cert + key and resolves `tenant_id`, `site_id`, `license_id`.

## Endpoints

### GET /sync/config

Returns full config for this device: cameras, AI thresholds, zones, schedule, hardware mapping.

**Response (200):**

```json
{
  "device_id": "string",
  "site_id": "uuid",
  "cameras": [
    {
      "id": "cam_1",
      "rtsp_url": "rtsp://...",
      "fps_sample": 2,
      "roi_mask": "base64 or url",
      "models": ["fire", "smoke"],
      "sensitivity": 0.7,
      "zones": [{"id": "zone_1", "polygon": [[x,y],...], "enabled": true}]
    }
  ],
  "hardware": {
    "siren": {"type": "relay", "pin": 1},
    "relays": []
  },
  "schedule": {},
  "sync_interval_sec": 60,
  "updated_at": "ISO8601"
}
```

### POST /sync/events

Push batch of events (idempotent by `event_id`).

**Request:**

```json
{
  "events": [
    {
      "event_id": "uuid or unique string",
      "type": "fire|smoke|intrusion|loitering|tampering|...",
      "priority": "critical|high|medium|low",
      "risk_score": 0-100,
      "camera_id": "string",
      "zone_id": "string",
      "snapshot_ref": "local path or inline base64",
      "clip_ref": "local path or presign",
      "payload": {},
      "occurred_at": "ISO8601",
      "signed_at": "ISO8601"
    }
  ]
}
```

**Response (202):**

```json
{
  "accepted": ["event_id_1", "event_id_2"],
  "rejected": [],
  "next_sync_after": 60
}
```

### POST /sync/telemetry

Push device health and performance.

**Request:**

```json
{
  "reported_at": "ISO8601",
  "cpu_percent": 45.2,
  "memory_mb": 1024,
  "inference_ms_p50": 12,
  "inference_ms_p99": 45,
  "model_version": "fire_v2.1",
  "uptime_seconds": 86400,
  "payload": {}
}
```

**Response (204):** No content.

### GET /sync/license

License check for this device (trial/expiry/features). Edge caches result; re-check on interval or when config requests return 403.

**Response (200):**

```json
{
  "state": "trial|active|expired|revoked",
  "tier": "BASIC|PROFESSIONAL|ENTERPRISE",
  "trial_ends_at": "ISO8601 or null",
  "expires_at": "ISO8601 or null",
  "feature_flags": {"fire": true, "theft": true, "multi_site": false},
  "max_devices": 5,
  "verified_at": "ISO8601"
}
```

**Response (403):** License invalid or device not bound; edge should restrict to minimal local-only mode (e.g. fire detection only, no cloud sync).

## Rate Limits

- Config: 1 req / 60 s per device.
- Events: 100 events per request; max 10 requests / min per device.
- Telemetry: 1 req / 5 min per device.
- License: 1 req / 5 min per device.

## Idempotency

- Events are deduplicated by `(device_id, event_id)`. Duplicate `event_id` returns 202 with event in `accepted` and no duplicate row in cloud.
