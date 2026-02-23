// JWT create/parse for RiskIntel (tenant_id, user_id, phone).
package auth

import (
	"context"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type claims struct {
	jwt.RegisteredClaims
	TenantID string `json:"tid"`
	UserID   string `json:"uid"`
	Phone    string `json:"phone"`
	Role     string `json:"role"`
}

const ctxKeyClaims = "claims"

func getSecret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "riskintel-dev-secret-change-in-production"
	}
	return []byte(s)
}

// CreateToken returns a JWT for the user (access token, 15 min).
func CreateToken(tenantID, userID, phone, role string) (string, error) {
	secret := getSecret()
	now := time.Now()
	c := claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.New().String(),
		},
		TenantID: tenantID,
		UserID:   userID,
		Phone:    phone,
		Role:     role,
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, c)
	return t.SignedString(secret)
}

// ParseToken parses a JWT string and returns claims or error (for refresh flow).
func ParseToken(tokenStr string) (*claims, error) {
	if tokenStr == "" {
		return nil, nil
	}
	secret := getSecret()
	t, err := jwt.ParseWithClaims(tokenStr, &claims{}, func(t *jwt.Token) (interface{}, error) {
		return secret, nil
	})
	if err != nil || !t.Valid {
		return nil, err
	}
	if c, ok := t.Claims.(*claims); ok {
		return c, nil
	}
	return nil, nil
}

// FromRequest parses Bearer token and returns claims or nil.
func FromRequest(r *http.Request) (*claims, error) {
	h := r.Header.Get("Authorization")
	if h == "" {
		return nil, nil
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(h, prefix) {
		return nil, nil
	}
	return ParseToken(strings.TrimPrefix(h, prefix))
}

// WithClaims puts claims in context.
func WithClaims(ctx context.Context, c *claims) context.Context {
	return context.WithValue(ctx, ctxKeyClaims, c)
}

// ClaimsFromContext returns claims from context (set by middleware).
func ClaimsFromContext(ctx context.Context) *claims {
	v := ctx.Value(ctxKeyClaims)
	if v == nil {
		return nil
	}
	if c, ok := v.(*claims); ok {
		return c
	}
	return nil
}
