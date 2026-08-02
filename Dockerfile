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

# ---------- Runner ----------
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Only the built SSR server + static client assets are shipped.
COPY --from=builder /app/.output ./.output

USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
