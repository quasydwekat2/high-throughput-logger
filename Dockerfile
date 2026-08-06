# ---------------------------------------------------------------------------
# Dockerfile — Node.js/TypeScript app (production, multi-stage)
# ---------------------------------------------------------------------------

# ── Stage 1: build TypeScript ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# ── Stage 2: lean production image ────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist

ARG PORT=8080
EXPOSE ${PORT}

CMD ["node", "dist/server.js"]
