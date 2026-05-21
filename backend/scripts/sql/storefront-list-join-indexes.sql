-- Indexes that speed up the storefront's `/store/products` list query.
--
-- Background: the storefront list query expands `*brand`, `+tags`, `+type`
-- per product. Each of those is a JOIN to a separate table. If the join
-- column on the LINKED side is unindexed, Postgres falls back to a sequential
-- scan PER product — making `?limit=100` quadratic and explaining the 10-60s
-- response times we saw in the May 2026 audit.
--
-- This file is idempotent (CREATE INDEX IF NOT EXISTS). Review the
-- diagnostic queries first, then run the CREATE INDEX statements during
-- low traffic. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction,
-- so run each statement separately (psql does this automatically when the
-- file has only top-level statements, not inside BEGIN/COMMIT).
--
-- To run:
--   psql "$DATABASE_URL" -f scripts/sql/storefront-list-join-indexes.sql
--
-- Or per statement via medusa exec / fly ssh.

----------------------------------------------------------------
-- DIAGNOSTIC: which indexes currently exist on the link tables
----------------------------------------------------------------
-- Comment these out if running headless; useful when running interactively.

\echo '--- product_product_brand_brand (storefront *brand expansion) ---'
SELECT indexdef
FROM pg_indexes
WHERE tablename = 'product_product_brand_brand'
ORDER BY indexname;

\echo '--- product_tag (storefront +tags expansion) ---'
SELECT indexdef
FROM pg_indexes
WHERE tablename = 'product_tags'
   OR tablename = 'product_tag'
ORDER BY tablename, indexname;

\echo '--- product (catalog list) ---'
SELECT indexdef
FROM pg_indexes
WHERE tablename = 'product'
ORDER BY indexname;

\echo '--- row counts ---'
SELECT 'product_product_brand_brand' AS table, count(*) FROM product_product_brand_brand
UNION ALL SELECT 'product', count(*) FROM product
UNION ALL SELECT 'brand', count(*) FROM brand;

----------------------------------------------------------------
-- FIX: indexes the storefront query plan benefits from
----------------------------------------------------------------

-- 1. product → brand link, by product_id (the storefront's lookup direction)
--    Medusa's link engine usually creates a (product_id, brand_id) composite
--    unique index, which CAN serve product_id lookups, but a single-column
--    index is faster for the cardinality we see (1 brand per product).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pbb_product_id
  ON product_product_brand_brand (product_id)
  WHERE deleted_at IS NULL;

-- 2. Reverse direction (brand landing page filters)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pbb_brand_id
  ON product_product_brand_brand (brand_id)
  WHERE deleted_at IS NULL;

-- 3. Catalog list filter (carried over from catalog-product-list-index.sql but
--    repeated here as the umbrella PLP-performance script so future audits
--    have one place to look).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medusa_product_list_catalog
  ON product (deleted_at, status, created_at DESC NULLS LAST);

-- After running, re-run the diagnostic block above and confirm the
-- IDX rows for idx_pbb_product_id / idx_pbb_brand_id are now present.
-- Then re-benchmark with:
--   curl -w "\n%{time_total}s\n" -o /dev/null \
--     "https://sc-prints-backend.fly.dev/store/products?limit=100&fields=id,handle,*brand&region_id=<reg>" \
--     -H "x-publishable-api-key: <pk>"
-- Expect the +brand variance from 1-25s → consistently <2s.
