// OTP store (in-memory, dev/prod with Redis later).
package auth

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

type otpEntry struct {
	Code      string
	ExpiresAt time.Time
}

var (
	otpMu    sync.RWMutex
	otpStore = map[string]otpEntry{}
	rateMu   sync.Mutex
	rateCount = map[string][]time.Time{} // phone -> last send times
)

const (
	otpTTL      = 5 * time.Minute
	otpLength   = 6
	rateLimit   = 3
	rateWindow  = 1 * time.Hour
	devBypassCode = "1234" // For demo: any phone can use this code
)

func GenerateOTP() string {
	const digits = "0123456789"
	b := make([]byte, otpLength)
	for i := range b {
		b[i] = digits[rand.Intn(len(digits))]
	}
	return string(b)
}

func StoreOTP(phone, code string) {
	otpMu.Lock()
	defer otpMu.Unlock()
	otpStore[phone] = otpEntry{Code: code, ExpiresAt: time.Now().Add(otpTTL)}
}

func ValidateOTP(phone, code string) bool {
	if code == devBypassCode {
		return true // Demo bypass
	}
	otpMu.Lock()
	defer otpMu.Unlock()
	e, ok := otpStore[phone]
	if !ok || time.Now().After(e.ExpiresAt) {
		return false
	}
	if e.Code != code {
		return false
	}
	delete(otpStore, phone)
	return true
}

func CanSendOTP(phone string) (bool, error) {
	rateMu.Lock()
	defer rateMu.Unlock()
	now := time.Now()
	times := rateCount[phone]
	// Keep only recent
	var kept []time.Time
	for _, t := range times {
		if now.Sub(t) < rateWindow {
			kept = append(kept, t)
		}
	}
	if len(kept) >= rateLimit {
		return false, fmt.Errorf("rate limit: max %d OTP per hour", rateLimit)
	}
	rateCount[phone] = append(kept, now)
	return true, nil
}
