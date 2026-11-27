#!/bin/bash
# Runs a command in backend/ pointed at the throwaway database, with every key in
# backend/.env blanked so it cannot reach live Stripe, Resend, R2, Meilisearch or PostHog.
DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$DIR/../../backend"
for k in $(grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$BACKEND/.env" 2>/dev/null); do export "$k="; done
export DATABASE_URL=postgres://medusa:medusa@localhost:54329/medusa_test
export JWT_SECRET=portal-e2e-not-a-secret
# Medusa 2.22 re-fills blank vars from .env; this makes .env read as empty.
export NODE_OPTIONS="--require $DIR/noenv.cjs"
export STORE_CORS="http://localhost:8000" ADMIN_CORS="http://localhost:9000" AUTH_CORS="http://localhost:8000,http://localhost:9000"
export TEAM_STORES_ENABLED=true BACKEND_PUBLIC_URL=http://localhost:9000 STOREFRONT_URL=http://localhost:8000 STOREFRONT_DEFAULT_COUNTRY_CODE=au
export MEDUSA_DISABLE_ADMIN=true
cd "$BACKEND" && exec "$@"
