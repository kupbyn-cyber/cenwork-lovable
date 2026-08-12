# CEN WORK — TanStack Start (Nitro SSR) self-host image
# Build:  docker build -t cen-work .
# Run:    docker run -p 3000:3000 --env-file .env.runtime cen-work

# ---------- Builder ----------
FROM oven/bun:1 AS builder
WORKDIR /app

# Install dependencies (bun.lock is the lockfile in this repo)
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Application source
COPY . .

# Public (non-secret) build-time variables baked into the client bundle.
# NEVER pass secrets here — anything VITE_* ends up in the browser bundle.
# This image is the self-host PostgreSQL production build, so the backend
# selector is hard-coded at BUILD TIME (Vite inlines import.meta.env.*).
ARG VITE_CEN_DB=postgres
ENV VITE_CEN_DB=$VITE_CEN_DB

# Optional legacy Supabase values — not required in PostgreSQL mode.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

# Nitro emits a standalone Node SSR server into .output/
ENV NODE_ENV=production \
    NITRO_PRESET=node
RUN bun run build

# Migration runner đóng gói kèm pg để runner image không cần node_modules.
RUN bun build scripts/migrate.mjs --target=node --outfile /app/migrate.bundle.mjs

# ---------- Runner ----------
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Only the built SSR server + static client assets are shipped.
COPY --from=builder /app/.output ./.output

# Migration tự động lúc khởi động: runner + toàn bộ SQL self-host.
COPY --from=builder /app/migrate.bundle.mjs ./scripts/migrate.mjs
COPY --from=builder /app/db/migrations ./db/migrations
COPY --from=builder /app/db/repair ./db/repair
COPY --from=builder /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
