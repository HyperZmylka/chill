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
    let state = started.state.clone();
    tokio::select! {
        result = started.task => {
            result??;
        }
        _ = shutdown_signal() => {
            tracing::info!("Zatrzymywanie Chill: zapisuj\u{0119} dane...");
            state.flush();
        }
    }
    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut terminate = match signal(SignalKind::terminate()) {
            Ok(signal) => signal,
            Err(_) => {
                let _ = tokio::signal::ctrl_c().await;
                return;
            }
        };
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = terminate.recv() => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
