// RiskIntel Cloud API
// Multi-tenant SaaS: auth, tenants, sites, events, license.
// See docs/api/openapi-cloud.yaml

package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/riskintel/cloud-api/internal/auth"
	"github.com/riskintel/cloud-api/internal/cors"
	"github.com/riskintel/cloud-api/internal/db"
	"github.com/riskintel/cloud-api/internal/handlers"
)

func main() {
	ctx := context.Background()
	if err := db.Init(ctx, os.Getenv("DATABASE_URL")); err != nil {
		fmt.Fprintf(os.Stderr, "DB init (optional): %v\n", err)
	}
	defer db.Close()

	r := chi.NewRouter()
	r.Use(cors.Handler, middleware.Logger, middleware.Recoverer, middleware.RealIP)

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	r.Route("/v1", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"ok"}`))
		})
		r.Post("/auth/otp/send", handlers.SendOTP)
		r.Post("/auth/otp/verify", handlers.VerifyOTP)
		r.Post("/auth/refresh", handlers.RefreshToken)
		// Protected (JWT required)
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireJWT)
			r.Get("/tenants/me", handlers.TenantsMe)
			r.Get("/sites", handlers.SitesList)
			r.Get("/sites/{site_id}", handlers.SiteDetail)
			r.Post("/sites/{site_id}/arm", handlers.SiteArm)
			r.Post("/sites/{site_id}/disarm", handlers.SiteDisarm)
			r.Post("/sites/{site_id}/siren", handlers.SiteSiren)
			r.Get("/events", handlers.EventsList)
			r.Get("/events/{event_id}", handlers.EventDetail)
			r.Post("/events/{event_id}/acknowledge", handlers.EventAcknowledge)
			r.Post("/events/{event_id}/escalate", handlers.EventEscalate)
			r.Get("/license/status", handlers.LicenseStatus)
		})
		// Edge Sync (X-Device-Key auth)
		r.Get("/sync/config", handlers.SyncConfig)
		r.Get("/sync/license", handlers.SyncLicense)
		r.Post("/sync/events", handlers.SyncEvents)
		r.Post("/sync/telemetry", handlers.SyncTelemetry)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	srv := &http.Server{Addr: ":" + port, Handler: r}
	go func() {
		_ = srv.ListenAndServe()
	}()
	fmt.Println("API listening on :" + port)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	_ = srv.Shutdown(context.Background())
}
