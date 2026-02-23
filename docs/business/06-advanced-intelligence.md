# Advanced Intelligence (Phase 6)

## 1. Daily Site Risk Score

- **Input**: Event count, severity, type mix over last 24h (or configurable window).
- **Output**: 0–100 score per site per day; store in `site_risk_daily`.
- **Use**: Dashboard, trends, insurance report, escalation (e.g. score > 80 → notify manager).

## 2. Behavioral Anomaly Learning

- **Concept**: Baseline “normal” activity per camera/zone (e.g. motion patterns, occupancy); flag deviations.
- **Implementation**: Lightweight statistical or ML model on edge or cloud; v1 can be rule-based (e.g. activity at unusual hour).
- **Scope**: Post-MVP; Phase 6 or later.

## 3. Event Timeline Replay

- **Feature**: Per site or per camera, select time range; replay event list with thumbnails and jump-to-time.
- **Implementation**: Cloud API returning events in order; frontend (web/mobile) timeline UI; optional clip playback.
- **Use**: Investigation, training, insurance.

## 4. Risk Heatmap

- **Concept**: Geographic or zone-based map of where events occur most (heat by zone/camera).
- **Implementation**: Aggregate events by zone/camera over period; render in dashboard.
- **Use**: Identify hot spots; optimize camera placement or procedures.

## 5. Insurance Compliance Report Generator

- **Content**: Site info, period, risk score trend, event summary (count by type/severity), list of critical events with timestamps; optional snapshot/clip links.
- **Format**: PDF and/or API (JSON) for ERP.
- **Schedule**: On-demand or scheduled (e.g. monthly); Enterprise and Professional.

## 6. ERP Integration API

- **Event webhook**: HTTP POST to customer URL on critical event (configurable).
- **Payload**: event_id, type, priority, risk_score, site_id, occurred_at, snapshot_url.
- **Alternative**: REST API for polling events; filter by site, type, date.
- **License**: Enterprise feature flag.

## 7. Remote Model Updates

- **Flow**: Cloud pushes new model version (URL + hash); edge downloads, verifies, hot reload.
- **Safety**: Fallback to previous model on failure; report version in telemetry.
- **Use**: Improve fire/theft detection without site visit.

## 8. Performance Telemetry

- **Already in scope**: inference_ms, cpu, memory, model_version, uptime in device_telemetry.
- **Extension**: Per-camera inference time; queue depth; dropped frames; dashboard in cloud.

## 9. Predictive Fire Probability Trend

- **Concept**: Simple trend (e.g. 7-day moving average of fire/smoke events or risk score) to highlight “increasing risk” sites.
- **Implementation**: Cloud aggregation; optional alert when trend crosses threshold.
- **Scope**: Phase 6; can start with rule-based trend.

---

*These items are part of the “Advanced Intelligence” phase and can be prioritized after core Edge + Cloud + Mobile + paid traction.*
