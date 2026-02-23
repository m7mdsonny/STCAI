//! RiskIntel Edge Sync - periodic config, license, event push, telemetry.
//! Run alongside ingestion + inference. See docs/api/edge-sync-api.md

use anyhow::Result;
use riskintel_sync::SyncClient;
use std::sync::Arc;
use std::time::Duration;
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env().add_directive("riskintel_sync=info".parse()?))
        .init();

    let base_url = std::env::var("SYNC_BASE_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    let device_key = std::env::var("SYNC_DEVICE_KEY").unwrap_or_else(|_| "dev-key".to_string());
    let sync_interval = std::env::var("SYNC_INTERVAL_SEC").ok().and_then(|s| s.parse().ok()).unwrap_or(60u64);

    let client = Arc::new(SyncClient::new(base_url, device_key)?);

    // Startup: config + license
    match client.get_config().await {
        Ok(cfg) => info!("Config: device_id={} site_id={} cameras={}", cfg.device_id, cfg.site_id, cfg.cameras.len()),
        Err(e) => info!("Config fetch failed (offline?): {}", e),
    }
    match client.get_license().await {
        Ok(lic) => info!("License: state={} tier={}", lic.state, lic.tier),
        Err(e) => info!("License fetch failed: {}", e),
    }

    let mut interval = tokio::time::interval(Duration::from_secs(sync_interval));
    let mut uptime_secs: u64 = 0;
    loop {
        interval.tick().await;
        uptime_secs += sync_interval;
        let c = Arc::clone(&client);
        let reported_at = chrono::Utc::now().to_rfc3339();
        let telemetry = serde_json::json!({
            "reported_at": reported_at,
            "cpu_percent": 0.0,
            "memory_mb": 0,
            "inference_ms_p50": 0,
            "inference_ms_p99": 0,
            "model_version": "v1",
            "uptime_seconds": uptime_secs
        });
        if let Err(e) = c.push_telemetry(&telemetry).await {
            info!("Telemetry push failed: {}", e);
        } else {
            info!("Telemetry sent (uptime {}s)", uptime_secs);
        }
    }
}
