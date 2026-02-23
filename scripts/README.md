# Scripts

## Cloud (local dev)

**Windows (PowerShell):**
```powershell
cd "d:\STC\STC AI VAP"
.\scripts\run-cloud-dev.ps1
```
Requires: Docker (for db, redis). Go optional (or use `docker compose up api` from `cloud/`).

**Linux/Mac:**
```bash
cd cloud
cp .env.example .env
docker compose up -d db redis
# wait a few seconds for DB init (includes seed)
export DATABASE_URL=postgresql://riskintel:riskintel@localhost:5432/riskintel
go run ./cmd/api
# Or: docker compose up api
```

## Mobile

```bash
cd mobile
flutter pub get
# Set API base in lib/main.dart (kApiBaseUrl) - e.g. http://10.0.2.2:8080 for Android emulator
flutter run
```

## Edge sync client

```bash
cd edge/sync
export SYNC_BASE_URL=http://localhost:8080   # or your API URL
export SYNC_DEVICE_KEY=dev-key
cargo run --release
```

## Seed data

After first `docker compose up db`, the DB is initialized with:
- Tenant: Demo Company (slug: demo)
- Site: Factory Alpha
- User: +201012345678, role admin
- License: trial, 14 days, PROFESSIONAL
- Edge device: EDGE-001

Login in the app with phone `+201012345678` and any OTP code (stub accepts any code).
