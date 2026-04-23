# syntax=docker/dockerfile:1.7

# ---- Stage 1: build the Vite frontend ----
FROM node:20-alpine AS build

WORKDIR /app

# VITE_* vars are inlined at build time — must be ARG/ENV during `vite build`.
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_ALLOWED_GOOGLE_EMAIL=""
ARG VITE_SHEET_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_ALLOWED_GOOGLE_EMAIL=$VITE_ALLOWED_GOOGLE_EMAIL \
    VITE_SHEET_ID=$VITE_SHEET_ID

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src

RUN npm run build

# ---- Stage 2: serve via nginx + run sidecar via supervisord ----
FROM nginx:alpine AS runtime

# Node for the sidecar; supervisor to run nginx + node together.
RUN apk add --no-cache nodejs npm supervisor tini \
    && rm -rf /var/cache/apk/*

# Frontend
COPY --from=build /app/dist /usr/share/nginx/html

# Sidecar — copy package manifests first for better layer caching, install prod deps, then copy source.
WORKDIR /app/sidecar
COPY sidecar/package*.json ./
RUN npm ci --omit=dev
COPY sidecar/ ./

# Nginx + supervisor config
COPY nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisord.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://127.0.0.1/api/health || exit 1

# tini as PID 1 → supervisord → nginx + node sidecar
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
