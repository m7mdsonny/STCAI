//! RiskIntel Edge - Video Ingestion
//! RTSP multi-camera, frame queue, memory cap, reconnect.
//! See docs/edge/01-edge-core-spec.md

use anyhow::Result;
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("riskintel_ingestion=info".parse()?),
        )
        .init();

    info!("RiskIntel Ingestion starting");
    // TODO: load config from file or sync endpoint
    // TODO: spawn one task per camera (RTSP connect, decode, push to queue)
    // TODO: frame queue with max_queue_frames; backpressure
    // TODO: reconnect with exponential backoff on disconnect
    // TODO: IPC or shared memory to inference workers

    tokio::signal::ctrl_c().await?;
    info!("RiskIntel Ingestion stopped");
    Ok(())
}
