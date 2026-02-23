# RiskIntel - Run Cloud (DB + Redis + API) for local development
# From repo root: .\scripts\run-cloud-dev.ps1

$RepoRoot = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location $RepoRoot

Write-Host "Starting Postgres + Redis..."
Set-Location cloud
docker compose up -d db redis

Write-Host "Waiting for Postgres..."
Start-Sleep -Seconds 5

Write-Host "Starting API (ensure DATABASE_URL is set or copy from .env.example)..."
$env:DATABASE_URL = "postgresql://riskintel:riskintel@localhost:5432/riskintel"
$env:PORT = "8080"
Set-Location api
go run ./cmd/api
# If Go not installed: docker compose up api
