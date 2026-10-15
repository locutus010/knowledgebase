# Kontext ist knowledgebase/ (siehe compose.yaml), damit das Caddyfile mitkommt.
FROM node:22-alpine AS build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /src/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/healthz || exit 1
