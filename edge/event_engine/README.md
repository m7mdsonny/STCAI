# Event Engine (placeholder)

Multi-frame validation, risk score, dedup, hardware trigger.  
See `docs/edge/01-edge-core-spec.md` § Event Engine.

Implementation options:
- **Rust**: consume detections from inference (via queue), emit events, call hardware driver.
- **Python**: same logic; receives detections from inference_worker, writes to SQLite and sync queue, calls GPIO/HTTP for siren.

Stub flow:
1. Input: stream of detections (camera_id, model, class, confidence, timestamp).
2. Multi-frame: require N consecutive above threshold → candidate event.
3. Risk score: from confidence + class + zone.
4. Dedup: same camera+type within T sec → one event.
5. Output: event record → local DB, sync queue, hardware command (siren/relay).
