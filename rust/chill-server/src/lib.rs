pub mod assets;
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
use axum::http::header::CONTENT_LENGTH;
use axum::http::{Extensions, HeaderMap, StatusCode, Version};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use tower_http::compression::{CompressionLayer, CompressionLevel};

use crate::config::Config;
use crate::state::AppState;

pub const MAX_BODY: usize = 13 * 1024 * 1024;

/// Binds the embedded HTTP server, returning the actual address, state and task.
pub async fn start(mut config: Config) -> Result<Started> {
    let listener = TcpListener::bind(format!("{}:{}", config.host, config.port)).await?;
    let address = listener.local_addr()?;
    config.port = address.port();
    let warm_assets = config.public_web;

    let state = Arc::new(AppState::new(config));
    if warm_assets {
        let state = state.clone();
        tokio::task::spawn_blocking(move || state.assets.warm());
    }
    let router = http::router(state.clone()).layer(DefaultBodyLimit::max(MAX_BODY));
    // Public deployments pay for bandwidth on every API response, so compress
    // JSON there. Desktop/localhost traffic skips the layer entirely.
    let router = if warm_assets {
        router.layer(
            CompressionLayer::new()
                .quality(CompressionLevel::Fastest)
                .compress_when(compressible_response),
        )
    } else {
        router
    };
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

/// Compress only textual responses above 1 KB. Attachments, voice notes and
/// images keep their original bytes, so public traffic never pays CPU to
/// "compress" already-compressed media.
fn compressible_response(
    status: StatusCode,
    _version: Version,
    headers: &HeaderMap,
    _extensions: &Extensions,
) -> bool {
    if status != StatusCode::OK {
        return false;
    }
    let Some(length) = headers
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
    else {
        return false;
    };
    if length < 1024 {
        return false;
    }
    let content_type = headers
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    content_type.starts_with("text/")
        || content_type.starts_with("application/json")
        || content_type.starts_with("application/javascript")
        || content_type.starts_with("application/xml")
        || content_type.starts_with("image/svg+xml")
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::header::{CONTENT_TYPE, CONTENT_LENGTH};
    use axum::http::HeaderValue;

    fn check(content_type: &str, length: usize, status: StatusCode) -> bool {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_str(content_type).unwrap());
        headers.insert(
            CONTENT_LENGTH,
            HeaderValue::from_str(&length.to_string()).unwrap(),
        );
        compressible_response(status, Version::HTTP_11, &headers, &Extensions::new())
    }

    #[test]
    fn compression_skips_media_and_small_bodies() {
        assert!(check("text/html; charset=utf-8", 4096, StatusCode::OK));
        assert!(check("application/json", 2048, StatusCode::OK));
        assert!(check("image/svg+xml", 2048, StatusCode::OK));
        assert!(!check("text/html; charset=utf-8", 512, StatusCode::OK));
        assert!(!check("image/png", 4096, StatusCode::OK));
        assert!(!check("video/mp4", 4096, StatusCode::OK));
        assert!(!check("application/octet-stream", 4096, StatusCode::OK));
        assert!(!check(
            "text/html; charset=utf-8",
            4096,
            StatusCode::PARTIAL_CONTENT
        ));
    }
}
