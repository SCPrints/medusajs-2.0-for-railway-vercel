#!/bin/bash
# Portal checks on a throwaway copy of the backend: embedded Postgres on :54329 and
# `medusa develop` on :9000, built fresh each run. Nothing live is touched (see env.sh).
#   pnpm test:portal                 every check, in order (later ones use state from t1-t5)
#   pnpm test:portal t16-group-order-org.mjs   named checks only, after the t1-t5 chain
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$DIR/../../backend"
ENV="$DIR/env.sh"
cd "$DIR"

if lsof -ti :9000 >/dev/null; then echo "Port 9000 is in use (a local backend?). Stop it, then run again."; exit 1; fi
[ -d node_modules ] || npm ci --silent || exit 1

# Refuse to start if any live key survives the blanking.
"$ENV" node -e 'const bad=Object.keys(process.env).filter(k=>/STRIPE|RESEND|MINIO|MEILI|POSTHOG|REDIS|SHIPPIT|ASCOLOUR|FASHIONBIZ|AUSSIE|LEGENDLIFE/.test(k)&&process.env[k]);const env=require("fs").readFileSync(process.cwd()+"/.env","utf8");if(bad.length||env){console.error("Live settings still visible:",bad,env?"(.env readable)":"");process.exit(1)}' || exit 1

cleanup() {
  lsof -ti :9000 | xargs kill 2>/dev/null
  lsof -ti :54329 | xargs kill 2>/dev/null
  rm -f "$BACKEND"/src/scripts/zz-e2e-*.ts
}
trap cleanup EXIT

node pg.mjs > pg.log 2>&1 &
for _ in $(seq 1 60); do lsof -ti :54329 >/dev/null && break; sleep 1; done
node -e 'const {Client}=require("pg");const c=new Client("postgres://medusa:medusa@localhost:54329/postgres");c.connect().then(async()=>{await c.query("drop database if exists medusa_test with (force)");await c.query("create database medusa_test");await c.end()}).catch(e=>{console.error(e.message);process.exit(1)})' || exit 1

echo "Building the throwaway copy (migrations + seeds, a few minutes)..."
cp zz-e2e-*.ts "$BACKEND/src/scripts/"
"$ENV" npx medusa db:migrate --execute-safe-links --execute-safe-search > setup.log 2>&1 || { echo "Migrations failed, see scripts/portal-e2e/setup.log"; exit 1; }
for s in seed seed-service-line-product seed-screen-setup-product seed-supacolour-setup-product seed-customer-tiers set-aud-prices-tax-inclusive zz-e2e-fixture; do
  "$ENV" npx medusa exec "src/scripts/$s.ts" >> setup.log 2>&1 || echo "seed $s failed (see setup.log)"
done
"$ENV" npx medusa user -e staff@e2e.test -p e2e-staff-pass >> setup.log 2>&1

"$ENV" npx medusa develop > backend.log 2>&1 &
for _ in $(seq 1 120); do grep -qE "Server is ready|Error starting" backend.log 2>/dev/null && break; sleep 2; done
grep -q "Server is ready" backend.log || { echo "Backend did not start, see scripts/portal-e2e/backend.log"; exit 1; }

CHAIN="t1-members.mjs t2-range.mjs t3-account.mjs t4-stock.mjs t5-allowance.mjs"
if [ $# -gt 0 ]; then TESTS="$CHAIN $*"; else TESTS="$(ls t*.mjs | sort -V | tr '\n' ' ')"; fi
rm -f t*.log
failed=""
for t in $TESTS; do
  echo; echo "=== $t"
  node "$t" > "${t%.mjs}.log" 2>&1 || failed="$failed $t"
  grep -E "^FAIL|passed$" "${t%.mjs}.log"
done
echo
if [ -n "$failed" ]; then echo "PORTAL CHECKS FAILED:$failed"; exit 1; fi
echo "PORTAL CHECKS PASSED: $(cat t*.log | grep -c '^PASS') checks"
