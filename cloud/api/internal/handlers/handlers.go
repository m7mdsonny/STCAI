// Package handlers - HTTP handlers for RiskIntel Cloud API (stubs / minimal).
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/riskintel/cloud-api/internal/auth"
	"github.com/riskintel/cloud-api/internal/db"
)

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// Auth

func SendOTP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid body")
		return
	}
	ok, err := auth.CanSendOTP(body.Phone)
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
		return
	}
	code := auth.GenerateOTP()
	auth.StoreOTP(body.Phone, code)
	log.Printf("[OTP] %s -> %s (send SMS in production)", body.Phone, code)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Phone string `json:"phone"`
		Code  string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if !auth.ValidateOTP(body.Phone, body.Code) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "invalid or expired OTP"})
		return
	}
	// Load user by phone from DB (user must exist when DB is used)
	tenantID, userID, role := "a0000001-0001-0000-0000-000000000001", "c0000001-0001-0000-0000-000000000001", "admin"
	if p := db.Pool(); p != nil {
		err := p.QueryRow(r.Context(), `SELECT tenant_id, id, role FROM users WHERE phone = $1 LIMIT 1`, body.Phone).Scan(&tenantID, &userID, &role)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "user not found for this phone. Ask your admin to add you."})
			return
		}
	}
	// When DB is nil (dev without DB), demo tenant/user used
	token, err := auth.CreateToken(tenantID, userID, body.Phone, role)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "token creation failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token":  token,
		"refresh_token": token,
		"expires_in":    900,
		"user":          map[string]any{"id": userID, "phone": body.Phone, "role": role},
	})
}

func RefreshToken(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RefreshToken == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "refresh_token required"})
		return
	}
	c, err := auth.ParseToken(body.RefreshToken)
	if err != nil || c == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "invalid or expired refresh token"})
		return
	}
	token, err := auth.CreateToken(c.TenantID, c.UserID, c.Phone, c.Role)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "token creation failed"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token": token,
		"expires_in":   900,
	})
}

// Tenant

func TenantsMe(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFromContext(r.Context())
	if c == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if p := db.Pool(); p != nil {
		var name, region, tier string
		err := p.QueryRow(r.Context(), `SELECT name, region, tier FROM tenants WHERE id = $1`, c.TenantID).Scan(&name, &region, &tier)
		if err == nil {
			_ = json.NewEncoder(w).Encode(map[string]any{"id": c.TenantID, "name": name, "region": region, "tier": tier})
			return
		}
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"id": c.TenantID, "name": "Demo Tenant", "region": "EGYPT", "tier": "PROFESSIONAL"})
}

// Sites

func SitesList(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFromContext(r.Context())
	if c == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if p := db.Pool(); p != nil {
		rows, err := p.Query(r.Context(), `SELECT s.id, s.name, s.timezone, s.config,
			(SELECT count(*) FROM edge_devices WHERE site_id = s.id) FROM sites s WHERE s.tenant_id = $1`, c.TenantID)
		if err == nil {
			defer rows.Close()
			var items []map[string]any
			for rows.Next() {
				var id, name, tz string
				var config []byte
				var deviceCount int
				if err := rows.Scan(&id, &name, &tz, &config, &deviceCount); err != nil {
					break
				}
				armed := false
				if len(config) > 0 {
					var c map[string]any
					_ = json.Unmarshal(config, &c)
					if v, _ := c["armed"].(bool); v {
						armed = true
					}
				}
				items = append(items, map[string]any{"id": id, "name": name, "timezone": tz, "armed": armed, "device_count": deviceCount})
			}
			if len(items) > 0 {
				_ = json.NewEncoder(w).Encode(map[string]any{"items": items, "total": len(items)})
				return
			}
		}
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"items": []map[string]any{
			{"id": "b0000001-0001-0000-0000-000000000001", "name": "Factory Alpha", "timezone": "Africa/Cairo", "armed": false, "device_count": 1},
		},
		"total": 1,
	})
}

func SiteDetail(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFromContext(r.Context())
	if c == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	siteID := chi.URLParam(r, "site_id")
	w.Header().Set("Content-Type", "application/json")
	if p := db.Pool(); p != nil {
		var name, tz string
		var config []byte
		if err := p.QueryRow(r.Context(), `SELECT name, timezone, config FROM sites WHERE id = $1 AND tenant_id = $2`, siteID, c.TenantID).Scan(&name, &tz, &config); err == nil {
			armed := false
			if len(config) > 0 {
				var cfg map[string]any
				_ = json.Unmarshal(config, &cfg)
				armed, _ = cfg["armed"].(bool)
			}
			rows, _ := p.Query(r.Context(), `SELECT id, device_id, name, status FROM edge_devices WHERE site_id = $1`, siteID)
			var devices []map[string]any
			if rows != nil {
				defer rows.Close()
				for rows.Next() {
					var id, devID, name, status string
					if rows.Scan(&id, &devID, &name, &status) == nil {
						devices = append(devices, map[string]any{"id": id, "device_id": devID, "name": name, "status": status})
					}
				}
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"id": siteID, "name": name, "timezone": tz, "armed": armed, "device_count": len(devices), "devices": devices})
			return
		}
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"id": siteID, "name": "Factory Alpha", "timezone": "Africa/Cairo", "armed": false, "device_count": 1, "devices": []map[string]any{{"id": "e0000001-0001-0000-0000-000000000001", "device_id": "EDGE-001", "name": "Edge 1", "status": "online"}}})
}

func SiteArm(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFromContext(r.Context())
	if c == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	siteID := chi.URLParam(r, "site_id")
	if p := db.Pool(); p != nil {
		_, _ = p.Exec(r.Context(), `UPDATE sites SET config = jsonb_set(COALESCE(config, '{}'), '{armed}', 'true'), updated_at = now() WHERE id = $1 AND tenant_id = $2`, siteID, c.TenantID)
	}
	w.WriteHeader(http.StatusNoContent)
}

func SiteDisarm(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFromContext(r.Context())
	if c == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	siteID := chi.URLParam(r, "site_id")
	if p := db.Pool(); p != nil {
		_, _ = p.Exec(r.Context(), `UPDATE sites SET config = jsonb_set(COALESCE(config, '{}'), '{armed}', 'false'), updated_at = now() WHERE id = $1 AND tenant_id = $2`, siteID, c.TenantID)
	}
	w.WriteHeader(http.StatusNoContent)
}

func SiteSiren(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFromContext(r.Context())
	if c == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	_ = c
	// TODO: push command to edge (MQTT or sync channel)
	w.WriteHeader(http.StatusNoContent)
}

// Events

func EventsList(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFromContext(r.Context())
	if c == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	limit := 100
	if s := r.URL.Query().Get("page_size"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	if p := db.Pool(); p != nil {
		rows, err := p.Query(r.Context(), `SELECT id, site_id, type, priority, risk_score, occurred_at, acknowledged_at
			FROM events WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT $2`, c.TenantID, limit)
		if err == nil {
			defer rows.Close()
			var items []map[string]any
			for rows.Next() {
				var id, siteID, typ, priority string
				var risk *float64
				var occurred time.Time
				var ack *time.Time
				if rows.Scan(&id, &siteID, &typ, &priority, &risk, &occurred, &ack) == nil {
					rScore := 0.0
					if risk != nil {
						rScore = *risk
					}
					items = append(items, map[string]any{
						"id": id, "site_id": siteID, "type": typ, "priority": priority, "risk_score": rScore,
						"occurred_at": occurred.Format(time.RFC3339), "acknowledged_at": ack,
					})
				}
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"items": items, "total": len(items)})
			return
		}
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"items": []map[string]any{}, "total": 0})
}

func EventDetail(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFromContext(r.Context())
	if c == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	eventID := chi.URLParam(r, "event_id")
	w.Header().Set("Content-Type", "application/json")
	if p := db.Pool(); p != nil {
		var typ, priority string
		var risk *float64
		var occurred time.Time
		var snapURL, clipURL *string
		if err := p.QueryRow(r.Context(), `SELECT type, priority, risk_score, occurred_at, snapshot_url, clip_url
			FROM events WHERE id = $1 AND tenant_id = $2`, eventID, c.TenantID).Scan(&typ, &priority, &risk, &occurred, &snapURL, &clipURL); err == nil {
			rScore := 0.0
			if risk != nil {
				rScore = *risk
			}
			s, cl := interface{}(nil), interface{}(nil)
			if snapURL != nil {
				s = *snapURL
			}
			if clipURL != nil {
				cl = *clipURL
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"id": eventID, "type": typ, "priority": priority, "risk_score": rScore, "occurred_at": occurred.Format(time.RFC3339), "snapshot_url": s, "clip_url": cl})
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte(`{"error":"not found"}`))
}

func EventAcknowledge(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFromContext(r.Context())
	if c == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	eventID := chi.URLParam(r, "event_id")
	if p := db.Pool(); p != nil {
		_, _ = p.Exec(r.Context(), `UPDATE events SET acknowledged_at = now(), acknowledged_by = $1 WHERE id = $2 AND tenant_id = $3`, c.UserID, eventID, c.TenantID)
	}
	w.WriteHeader(http.StatusNoContent)
}

func EventEscalate(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFromContext(r.Context())
	if c == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	eventID := chi.URLParam(r, "event_id")
	if p := db.Pool(); p != nil {
		_, _ = p.Exec(r.Context(), `UPDATE events SET escalated_at = now() WHERE id = $1 AND tenant_id = $2`, eventID, c.TenantID)
	}
	w.WriteHeader(http.StatusNoContent)
}

// License

func LicenseStatus(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFromContext(r.Context())
	if c == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if p := db.Pool(); p != nil {
		var tier, state string
		var expires *time.Time
		var maxDev, maxPhone int
		var flags []byte
		if err := p.QueryRow(r.Context(), `SELECT tier, state, expires_at, max_devices, max_phones, feature_flags FROM licenses WHERE tenant_id = $1`, c.TenantID).Scan(&tier, &state, &expires, &maxDev, &maxPhone, &flags); err == nil {
			var ff map[string]bool
			_ = json.Unmarshal(flags, &ff)
			expStr := interface{}(nil)
			if expires != nil {
				expStr = expires.Format(time.RFC3339)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"tier": tier, "state": state, "expires_at": expStr, "max_devices": maxDev, "max_phones": maxPhone, "feature_flags": ff})
			return
		}
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"tier": "PROFESSIONAL", "state": "active", "expires_at": time.Now().AddDate(1, 0, 0).Format(time.RFC3339), "max_devices": 10, "max_phones": 5, "feature_flags": map[string]bool{"fire": true, "theft": true}})
}
