# Publiczna wersja Chill — obraz serwera (bez Electrona)
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=47830 \
    CHILL_HOST=0.0.0.0 \
    CHILL_DATA_DIR=/data \
    CHILL_PUBLIC_WEB=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p /data && chown -R node:node /data /app
USER node

VOLUME ["/data"]
EXPOSE 47830

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "main.js", "--public-web"]
