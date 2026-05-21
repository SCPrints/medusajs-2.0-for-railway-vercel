-- Indexes for the storefront's `/store/products` list query.
--
-- TL;DR after running this against production on 2026-05-22:
--   - Medusa's link engine ALREADY creates the indexes you'd want on
--     product_product_brand_brand (one partial index per direction, plus
--     the composite primary key). Don't re-add them.
--   - The product table benefits from a composite (deleted_at, status,
--     created_at DESC) for catalog list queries — Medusa doesn't add this.
--
-- Run with:
--   psql "$DATABASE_URL" -f scripts/sql/storefront-list-join-indexes.sql
--
-- Or via fly+node (the actual pattern that worked):
--   1. Save this as a Node script using `pg` (pg is in /app/.medusa/
--      server/node_modules/pg on the Fly image).
--   2. Upload via `fly ssh sftp shell --app sc-prints-backend`.
--   3. Run with `NODE_PATH=/app/.medusa/server/node_modules node /tmp/...`.
--      Naive `node /tmp/script.js` won't find pg because Node resolves
--      modules relative to the script's own dir, not the cwd.
--
-- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction, so run
-- each statement separately. psql does this automatically for top-level
-- statements; pg's `client.query()` is auto-commit by default.

----------------------------------------------------------------
-- DIAGNOSTIC (read-only — confirm current state before changes)
----------------------------------------------------------------

\echo '--- indexes on product_product_brand_brand (Medusa link table) ---'
\echo 'Expected to already exist: IDX_brand_id_*, IDX_deleted_at_*,'
\echo '  IDX_id_*, IDX_product_id_*, product_product_brand_brand_pkey.'
\echo 'These are created by Medusa db:sync-links — no need to re-add.'
SELECT indexdef
FROM pg_indexes
WHERE tablename = 'product_product_brand_brand'
ORDER BY indexname;

\echo '--- indexes on product (catalog list path) ---'
SELECT indexdef
FROM pg_indexes
WHERE tablename = 'product'
ORDER BY indexname;

\echo '--- row counts ---'
SELECT 'product_product_brand_brand' AS table_name, count(*) FROM product_product_brand_brand
UNION ALL SELECT 'product', count(*) FROM product
UNION ALL SELECT 'brand', count(*) FROM brand;

----------------------------------------------------------------
-- NEW INDEX: composite catalog list index
----------------------------------------------------------------
-- The catalog list query is "SELECT ... FROM product WHERE deleted_at
-- IS NULL AND status = 'published' ORDER BY created_at DESC". Medusa
-- has single-column indexes on deleted_at and status, but no composite
-- ordered by created_at — so the query plan ends up doing a bitmap
-- combine + sort. The composite below lets Postgres use one index for
-- the entire predicate + ORDER BY.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medusa_product_list_catalog
  ON product (deleted_at, status, created_at DESC NULLS LAST);

----------------------------------------------------------------
-- DELIBERATELY NOT ADDED:
--   - idx_pbb_product_id  — Medusa already creates IDX_product_id_*
--   - idx_pbb_brand_id    — Medusa already creates IDX_brand_id_*
-- An earlier version of this script added them; the audit on
-- 2026-05-22 found them to be exact duplicates of the Medusa-created
-- ones, and they were dropped. Don't re-add.
----------------------------------------------------------------
