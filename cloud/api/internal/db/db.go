// Package db - PostgreSQL connection pool for RiskIntel Cloud.
package db

import (
	"context"
	"fmt"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	pool   *pgxpool.Pool
	poolMu sync.Mutex
)

// Init connects to PostgreSQL if DATABASE_URL is set. Safe to call multiple times.
func Init(ctx context.Context, databaseURL string) error {
	if databaseURL == "" {
		return nil
	}
	poolMu.Lock()
	defer poolMu.Unlock()
	if pool != nil {
		return nil
	}
	p, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("db init: %w", err)
	}
	if err := p.Ping(ctx); err != nil {
		p.Close()
		return fmt.Errorf("db ping: %w", err)
	}
	pool = p
	return nil
}

// Pool returns the global pool (may be nil if DATABASE_URL was not set).
func Pool() *pgxpool.Pool {
	poolMu.Lock()
	defer poolMu.Unlock()
	return pool
}

// Close closes the global pool. Call from main on shutdown.
func Close() {
	poolMu.Lock()
	defer poolMu.Unlock()
	if pool != nil {
		pool.Close()
		pool = nil
	}
}
