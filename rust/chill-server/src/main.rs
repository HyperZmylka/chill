use tracing_subscriber::EnvFilter;

use chill_server::config::Config;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env();
    let public = config.public_web;
    let data_dir = config.data_dir.clone();

    let started = chill_server::start(config).await?;
    tracing::info!("Chill Rust server: http://127.0.0.1:{}", started.address.port());
    tracing::info!("Dane: {}", data_dir.display());
    if public {
        tracing::info!("Tryb publiczny: tak");
    }
    started.task.await??;
    Ok(())
}
