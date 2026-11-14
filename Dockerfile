# Publiczna wersja Chill — serwer Rust (bez Node i Electrona).
FROM rust:1.90-bookworm AS build

WORKDIR /src
COPY rust ./rust
RUN cargo build --release --manifest-path rust/Cargo.toml -p chill-server

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /data chill

ENV PORT=47830 \
    CHILL_HOST=0.0.0.0 \
    CHILL_DATA_DIR=/data \
    CHILL_PUBLIC_WEB=1 \
    CHILL_WEB_ROOT=/app

WORKDIR /app

COPY --from=build /src/rust/target/release/chill-server /usr/local/bin/chill-server
COPY index.html style.css minigames.css renderer.js minigames.js gifs.js attachments.js stickers.js voice.js appearance.js chill-web.js tauri-desktop.js package.json ./
COPY build/icon.png ./build/icon.png

RUN mkdir -p /data && chown -R chill:chill /data /app
USER chill

VOLUME ["/data"]
EXPOSE 47830

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["chill-server"]
