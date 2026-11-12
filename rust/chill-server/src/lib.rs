pub mod bridge;
pub mod config;
pub mod http;
pub mod model;
pub mod state;
pub mod ws;

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Result;
use axum::extract::DefaultBodyLimit;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

use crate::config::Config;
use crate::state::AppState;

pub const MAX_BODY: usize = 8 * 1024 * 1024;

/// Binds the embedded HTTP server, returning the actual address, state and task.
pub async fn start(mut config: Config) -> Result<Started> {
    let listener = TcpListener::bind(format!("{}:{}", config.host, config.port)).await?;
    let address = listener.local_addr()?;
    config.port = address.port();

    let state = Arc::new(AppState::new(config));
    let router = http::router(state.clone()).layer(DefaultBodyLimit::max(MAX_BODY));
    let task = tokio::spawn(async move {
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await?;
        Ok::<(), anyhow::Error>(())
    });

    Ok(Started {
        address,
        state,
        task,
    })
}

pub struct Started {
    pub address: SocketAddr,
    pub state: Arc<AppState>,
    pub task: JoinHandle<Result<()>>,
}
