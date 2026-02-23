package auth

import (
	"context"
	"net/http"
)

// RequireJWT middleware: 401 if no valid JWT, else set claims in context.
func RequireJWT(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := FromRequest(r)
		if err != nil || c == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"unauthorized","message":"Valid token required"}`))
			return
		}
		ctx := WithClaims(r.Context(), c)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
