# AI Modules Specification

## 1. Fire & Smoke Detection

### Detection Targets

- **Smoke**: Visible smoke (gray/white plumes).
- **Flame**: Open flame (orange/yellow flicker).
- **Spark**: Small ignition sources (optional).
- **Light fluctuation anomaly**: Sudden brightness change (e.g. flash fire).
- **Adaptive light compensation**: Normalize for day/night and indoor lighting to reduce false positives.

### Model Behavior

- Multi-frame confirmation: e.g. 2–3 consecutive frames above threshold.
- False-positive suppression: Exclude known distractors (e.g. steam, dust, headlights) via training or rules.
- Output: Class (smoke / flame / spark), confidence, optional bbox.
- **Per-camera**: Sensitivity (threshold), ROI, enabled/disabled.
- **Alert priority**: Fire = critical; smoke = high (configurable).

### Tuning

- **Sensitivity**: 0.0–1.0; maps to confidence threshold.
- **Zones**: Only fire/smoke in configured zones count.
- **Schedule**: Not typically used for fire (always on); optional “maintenance window” to mute.

---

## 2. Anti-Theft & Internal Monitoring

### Detection Targets

- **Intrusion**: Person/object in restricted zone.
- **Loitering**: Person staying in zone longer than threshold.
- **Multi-person zone violation**: More than N people in zone.
- **Restricted area enforcement**: Zone-based rule (e.g. no entry after hours).
- **Camera tampering**: Defocus, occlusion, redirection.
- **Sudden darkness**: Lens cover or light cut.

### Logic

- **Schedule-based**: Apply different rules by time (e.g. after hours = intrusion triggers alarm).
- **Zone mapping**: Polygons per camera; only detections inside zone and within schedule count.
- **Tampering**: Heuristic or small model (blur, coverage, scene change); trigger separate event type.
- **Sudden darkness**: Frame mean luminance drop below threshold; confirm over few frames.

### Tuning

- **Sensitivity**: Threshold for person detection and loiter time.
- **Zones**: Draw polygons; set “restricted” vs “allowed”.
- **Schedule**: Time windows for intrusion/loitering rules.
- **Alert priority**: Intrusion = high; loitering = medium; tampering = high (configurable).

---

## 3. Common Module Requirements

| Requirement | Implementation |
|-------------|----------------|
| Adjustable sensitivity | Config field per camera: `sensitivity` 0.0–1.0 → threshold |
| Configurable zones | Per-camera `zones[]`: id, polygon, enabled, schedule |
| Camera-level settings | All settings in `cameras[]` in config; overridable per camera |
| Alert priority | Per event type: critical / high / medium / low in config |
| Model versioning | Report in event payload and telemetry; support hot reload |
| ROI | Optional mask or polygon to run inference only on region |

---

## 4. Model Delivery

- **Initial**: Shipped with edge image or installed during provisioning.
- **Remote update**: Cloud can push new model URL/version; edge downloads, verifies (hash), then hot reload.
- **Fallback**: If new model load fails, keep previous model and report error in telemetry.

---

*Next: [Hardware Automation](03-hardware-automation.md)*
