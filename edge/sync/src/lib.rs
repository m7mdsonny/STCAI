//! RiskIntel Edge Sync Client
//! GET config, POST events, POST telemetry, GET license.
//! Auth: TLS client cert + X-Device-Key. See docs/api/edge-sync-api.md

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub device_id: String,
    pub site_id: String,
    #[serde(default)]
    pub cameras: Vec<CameraConfig>,
    #[serde(default)]
    pub hardware: serde_json::Value,
    #[serde(default)]
    pub sync_interval_sec: u64,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraConfig {
    pub id: String,
    pub rtsp_url: String,
    #[serde(default)]
    pub fps_sample: u32,
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default)]
    pub sensitivity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub state: String,
    pub tier: String,
    #[serde(default)]
    pub trial_ends_at: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
    pub feature_flags: Option<serde_json::Value>,
    pub max_devices: Option<u32>,
    pub verified_at: Option<String>,
}

/// Sync client: base URL, device_id, API key. TLS client cert from env or path (TODO).
pub struct SyncClient {
    base_url: String,
    device_key: String,
    client: reqwest::Client,
}

impl SyncClient {
    pub fn new(base_url: String, device_key: String) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()?;
        Ok(Self { base_url, device_key, client })
    }

    /// GET /sync/config
    pub async fn get_config(&self) -> Result<SyncConfig> {
        let url = format!("{}/v1/sync/config", self.base_url.trim_end_matches('/'));
        let res = self
            .client
            .get(&url)
            .header("X-Device-Key", &self.device_key)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(res)
    }

    /// GET /sync/license
    pub async fn get_license(&self) -> Result<LicenseStatus> {
        let url = format!("{}/v1/sync/license", self.base_url.trim_end_matches('/'));
        let res = self
            .client
            .get(&url)
            .header("X-Device-Key", &self.device_key)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(res)
    }

    /// POST /sync/events - batch push
    pub async fn push_events(&self, events: &[serde_json::Value]) -> Result<serde_json::Value> {
        let url = format!("{}/v1/sync/events", self.base_url.trim_end_matches('/'));
        let body = serde_json::json!({ "events": events });
        let res = self
            .client
            .post(&url)
            .header("X-Device-Key", &self.device_key)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(res)
    }

    /// POST /sync/telemetry
    pub async fn push_telemetry(&self, payload: &serde_json::Value) -> Result<()> {
        let url = format!("{}/v1/sync/telemetry", self.base_url.trim_end_matches('/'));
        self.client
            .post(&url)
            .header("X-Device-Key", &self.device_key)
            .json(payload)
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
}
