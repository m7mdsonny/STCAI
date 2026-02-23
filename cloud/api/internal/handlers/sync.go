// Sync API handlers for edge devices (X-Device-Key auth).
// See docs/api/edge-sync-api.md

package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/riskintel/cloud-api/internal/db"
)

const deviceKeyHeader = "X-Device-Key"

// resolveDevice returns device_id, site_id, tenant_id, edge_device_uuid from api_key.
func resolveDevice(ctx context.Context, apiKey string) (deviceID, siteID, tenantID string, edgeDeviceID uuid.UUID, ok bool) {
	p := db.Pool()
	if p == nil {
		return "", "", "", uuid.Nil, false
	}
	var devID, sID, tID string
	var eID uuid.UUID
	err := p.QueryRow(ctx, `SELECT e.id, e.device_id, e.site_id, s.tenant_id FROM edge_devices e JOIN sites s ON s.id = e.site_id WHERE e.api_key = $1`, apiKey).Scan(&eID, &devID, &sID, &tID)
	if err != nil {
		return "", "", "", uuid.Nil, false
	}
	return devID, sID, tID, eID, true
}


func SyncConfig(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get(deviceKeyHeader)
	if key == "" {
		jsonError(w, http.StatusUnauthorized, "missing X-Device-Key")
		return
	}
	deviceID, siteID, _, edgeID, ok := resolveDevice(r.Context(), key)
	if !ok {
		jsonError(w, http.StatusUnauthorized, "invalid device key")
		return
	}
	if p := db.Pool(); p != nil {
		_, _ = p.Exec(r.Context(), `UPDATE edge_devices SET last_seen_at = now() WHERE id = $1`, edgeID)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"device_id":         deviceID,
		"site_id":           siteID,
		"cameras":           []any{map[string]any{"id": "cam_1", "rtsp_url": "rtsp://localhost/stream", "fps_sample": 2, "models": []string{"fire", "smoke"}, "sensitivity": 0.7},
		"hardware":          map[string]any{"siren": map[string]any{"type": "relay", "pin": 1}, "relays": []any{}},
		"sync_interval_sec": 60,
		"updated_at":        time.Now().UTC().Format(time.RFC3339),
	})
}

func jsonError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func SyncLicense(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get(deviceKeyHeader)
	if key == "" {
		jsonError(w, http.StatusUnauthorized, "missing X-Device-Key")
		return
	}
	_, _, tenantID, _, ok := resolveDevice(r.Context(), key)
	w.Header().Set("Content-Type", "application/json")
	if ok && tenantID != "" && db.Pool() != nil {
		var state, tier string
		var trialEnds, expires *time.Time
		var flags []byte
		if err := db.Pool().QueryRow(r.Context(), `SELECT state, tier, trial_ends_at, expires_at, feature_flags FROM licenses WHERE tenant_id = $1`, tenantID).Scan(&state, &tier, &trialEnds, &expires, &flags); err == nil {
			var ff map[string]bool
			_ = json.Unmarshal(flags, &ff)
			trialStr, expStr := interface{}(nil), interface{}(nil)
			if trialEnds != nil {
				trialStr = trialEnds.Format(time.RFC3339)
			}
			if expires != nil {
				expStr = expires.Format(time.RFC3339)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"state": state, "tier": tier, "trial_ends_at": trialStr, "expires_at": expStr, "feature_flags": ff, "verified_at": time.Now().UTC().Format(time.RFC3339)})
			return
		}
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"state":        "trial",
		"tier":         "PROFESSIONAL",
		"trial_ends_at": time.Now().Add(14 * 24 * time.Hour).UTC().Format(time.RFC3339),
		"expires_at":   nil,
		"feature_flags": map[string]bool{"fire": true, "theft": true},
		"verified_at":   time.Now().UTC().Format(time.RFC3339),
	})
}

func SyncEvents(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get(deviceKeyHeader)
	if key == "" {
		jsonError(w, http.StatusUnauthorized, "missing X-Device-Key")
		return
	}
	_, siteID, tenantID, edgeDeviceID, ok := resolveDevice(r.Context(), key)
	if !ok {
		jsonError(w, http.StatusUnauthorized, "invalid device key")
		return
	}
	var body struct {
		Events []map[string]any `json:"events"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid body")
		return
	}
	p := db.Pool()
	accepted := make([]string, 0, len(body.Events))
	for _, e := range body.Events {
		eventID, _ := e["event_id"].(string)
		typ, _ := e["type"].(string)
		priority, _ := e["priority"].(string)
		riskScore, _ := e["risk_score"].(float64)
		cameraID, _ := e["camera_id"].(string)
		zoneID, _ := e["zone_id"].(string)
		occurredAt, _ := e["occurred_at"].(string)
		if eventID == "" || typ == "" {
			continue
		}
		if p != nil {
			var occ time.Time
			_ = occ.UnmarshalText([]byte(occurredAt))
			if occ.IsZero() {
				occ = time.Now()
			}
			payload := []byte("{}")
			if pld, ok := e["payload"]; ok {
				payload, _ = json.Marshal(pld)
			}
			_, err := p.Exec(r.Context(), `INSERT INTO events (tenant_id, site_id, edge_device_id, event_id, type, priority, risk_score, camera_id, zone_id, payload, occurred_at)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (edge_device_id, event_id) DO NOTHING`,
				tenantID, siteID, edgeDeviceID, eventID, typ, priority, riskScore, cameraID, zoneID, payload, occ)
			if err != nil {
				continue
			}
		}
		accepted = append(accepted, eventID)
	}
	w.WriteHeader(http.StatusAccepted)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"accepted": accepted, "rejected": []string{}, "next_sync_after": 60})
}

func SyncTelemetry(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get(deviceKeyHeader)
	if key == "" {
		jsonError(w, http.StatusUnauthorized, "missing X-Device-Key")
		return
	}
	_, _, tenantID, edgeDeviceID, ok := resolveDevice(r.Context(), key)
	if !ok {
		jsonError(w, http.StatusUnauthorized, "invalid device key")
		return
	}
	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid body")
		return
	}
	reportedAt := time.Now()
	if t, ok := payload["reported_at"].(string); ok {
		_ = reportedAt.UnmarshalText([]byte(t))
	}
	if p := db.Pool(); p != nil {
		_, _ = p.Exec(r.Context(), `UPDATE edge_devices SET last_seen_at = now() WHERE id = $1`, edgeDeviceID)
		cpu, _ := payload["cpu_percent"].(float64)
		mem, _ := payload["memory_mb"].(float64)
		p50, _ := payload["inference_ms_p50"].(float64)
		p99, _ := payload["inference_ms_p99"].(float64)
		model, _ := payload["model_version"].(string)
		uptime, _ := payload["uptime_seconds"].(float64)
		pl, _ := json.Marshal(payload)
		_, _ = p.Exec(r.Context(), `INSERT INTO device_telemetry (edge_device_id, tenant_id, reported_at, cpu_percent, memory_mb, inference_ms_p50, inference_ms_p99, model_version, uptime_seconds, payload)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			edgeDeviceID, tenantID, reportedAt, cpu, mem, int(p50), int(p99), model, int64(uptime), pl)
	}
	w.WriteHeader(http.StatusNoContent)
}
