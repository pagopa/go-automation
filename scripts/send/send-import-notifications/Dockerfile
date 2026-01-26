# =============================================================================
# Dockerfile for send-import-notifications
# =============================================================================
# Multi-stage build optimized for pnpm monorepo
#
# Build: docker build -t send-import-notifications .
# Run:   docker run -v $(pwd)/data:/app/data send-import-notifications
#
# Stage 1: Base - Common base with pnpm
# Stage 2: Build - Compile TypeScript
# Stage 3: Production - Minimal runtime image
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Base
# -----------------------------------------------------------------------------
FROM node:24-alpine@sha256:931d7d57f8c1fd0e2179dbff7cc7da4c9dd100998bc2b32afc85142d8efbc213 AS base

# Install pnpm globally
# RUN corepack enable && corepack prepare pnpm@9 --activate
RUN corepack enable && corepack prepare pnpm@latest --activate
 
# Set working directory to monorepo root
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: Dependencies & Build
# -----------------------------------------------------------------------------
FROM base AS build

# Copy workspace configuration files first (for better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# Copy go-common package
COPY packages/go-common/package.json ./packages/go-common/
COPY packages/go-common/tsconfig.json ./packages/go-common/
COPY packages/go-common/src/ ./packages/go-common/src/

# Copy send-import-notifications script
COPY scripts/send/send-import-notifications/package.json ./scripts/send/send-import-notifications/
COPY scripts/send/send-import-notifications/tsconfig.json ./scripts/send/send-import-notifications/
COPY scripts/send/send-import-notifications/src/ ./scripts/send/send-import-notifications/src/

# Install all dependencies (including devDependencies for building)
# Note: pnpm v10 blocks build scripts by default for security
# In Docker build we trust dependencies, so we enable scripts
RUN echo "enable-pre-post-scripts=true" > .npmrc && \
    pnpm install --frozen-lockfile && \
    rm .npmrc

# Build go-common first (dependency)
RUN pnpm --filter=@go-automation/go-common build

# Build the script
RUN pnpm --filter=send-import-notifications build

# Use pnpm deploy to prepare production deployment
# pnpm v10+ with inject-workspace-packages=true resolves workspace deps properly
RUN pnpm --filter=send-import-notifications deploy --prod /tmp/prod-deploy

# -----------------------------------------------------------------------------
# Stage 3: Production
# -----------------------------------------------------------------------------
FROM node:24-alpine@sha256:931d7d57f8c1fd0e2179dbff7cc7da4c9dd100998bc2b32afc85142d8efbc213 AS production

# Add labels for container identification
LABEL org.opencontainers.image.title="send-import-notifications"
LABEL org.opencontainers.image.description="SEND Notification Import Tool - CSV Import Workflow"
LABEL org.opencontainers.image.vendor="Team GO - Gestione Operativa"
LABEL org.opencontainers.image.version="1.0.0"

# Create non-root user for security
RUN addgroup -g 1001 gouser && \
    adduser -u 1001 -G gouser -s /bin/sh -D gouser

# Set working directory
WORKDIR /app

# Copy monorepo root package.json for GOPaths to detect project root
# GOPaths looks for package.json with workspaces or name="go-automation"
COPY --from=build /app/package.json ./package.json

# Copy production deployment from pnpm deploy into scripts subfolder
# to maintain expected directory structure for GOPaths
COPY --from=build /tmp/prod-deploy ./scripts/send/send-import-notifications/

# Copy local configs (fallback configuration)
COPY scripts/send/send-import-notifications/configs/ ./scripts/send/send-import-notifications/configs/

# Create data directory structure with proper permissions
# This will be the mount point for external data
RUN mkdir -p /app/data/send-import-notifications/configs \
             /app/data/send-import-notifications/inputs \
             /app/data/send-import-notifications/outputs && \
    chown -R gouser:gouser /app

# Set environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Switch to non-root user
USER gouser

# Working directory for script execution
WORKDIR /app/scripts/send/send-import-notifications

# Default command
CMD ["node", "dist/index.js"]
