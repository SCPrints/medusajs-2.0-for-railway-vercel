FROM node:22-slim

# System deps for sharp (libvips) and native module compilation
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Must match packageManager in package.json
RUN npm install -g pnpm@9.10.0

WORKDIR /app

# Copy manifests and patches first for layer caching
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install all deps — pnpm applies patches automatically
RUN pnpm install --frozen-lockfile

COPY . .

# medusa build requires these env vars to be set; placeholders are fine
# (no DB connection or real auth happens during build).
# BACKEND_PUBLIC_URL is baked into the admin SPA — it must be the real public URL,
# otherwise the admin tries to call http://localhost:9000 from the browser.
# A build arg so staging (fly.staging.toml) can bake in its own URL; the default
# is production, so `fly deploy` with fly.toml builds exactly as before.
ARG BACKEND_PUBLIC_URL=https://api.scprints.com.au
ENV DATABASE_URL=postgresql://x:x@localhost:5432/x \
    JWT_SECRET=build-placeholder \
    COOKIE_SECRET=build-placeholder \
    BACKEND_PUBLIC_URL=${BACKEND_PUBLIC_URL}

# The admin (Vite) build sits right at Node's default ~2 GB heap and OOMs
# intermittently; build-step only, the runtime is unaffected.
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm build

EXPOSE 9000

CMD ["pnpm", "start"]
