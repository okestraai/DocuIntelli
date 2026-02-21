# ============================================================
# Stage 1: Build the React frontend (Vite)
# ============================================================
FROM node:20-alpine AS frontend-build

WORKDIR /app

# VITE_ env vars must be ARGs — Vite bakes them into the JS bundle at build time
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_STRIPE_STARTER_PRICE_ID
ARG VITE_STRIPE_PRO_PRICE_ID

# Copy root package files for dependency install
COPY package.json package-lock.json ./

# Install frontend dependencies (includes Vite, React, Tailwind, etc.)
RUN npm ci --ignore-scripts

# Copy frontend source and config files
COPY index.html ./
COPY vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY tailwind.config.js postcss.config.js ./
COPY public/ ./public/
COPY src/ ./src/

# Build frontend — VITE_ args are read by Vite via import.meta.env
RUN npm run build


# ============================================================
# Stage 2: Build the Express backend (TypeScript)
# ============================================================
FROM node:20-alpine AS backend-build

WORKDIR /app/server

# Copy server package files
COPY server/package.json server/package-lock.json ./

# Install all dependencies (including devDeps for tsc)
RUN npm ci

# Copy server source and config
COPY server/src/ ./src/
COPY server/tsconfig.json ./

# Compile TypeScript
RUN npx tsc

# Prune dev dependencies for the runtime image
RUN npm prune --production


# ============================================================
# Stage 3: Production runtime (slim)
# ============================================================
FROM node:20-alpine AS runtime

# LibreOffice (headless) for .doc → text conversion
RUN apk add --no-cache libreoffice-writer libreoffice-common font-noto

# Security: run as non-root user
RUN addgroup -g 1001 -S docuintelli && \
    adduser -S docuintelli -u 1001

WORKDIR /app

# Copy built frontend (Vite output → /app/dist)
COPY --from=frontend-build /app/dist ./dist

# Copy compiled backend + production node_modules
COPY --from=backend-build /app/server/dist ./server/dist
COPY --from=backend-build /app/server/node_modules ./server/node_modules
COPY --from=backend-build /app/server/package.json ./server/package.json

# Create logs directory
RUN mkdir -p /app/logs && chown -R docuintelli:docuintelli /app

USER docuintelli

EXPOSE 5000

# Health check — hits the unauthenticated /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "server/dist/index.js"]
