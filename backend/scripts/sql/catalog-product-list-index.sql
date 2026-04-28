-- Optional Postgres index to speed up product list queries that filter by status / soft-delete
-- and sort by `created_at` (still subject to OFFSET cost for very deep `?page=` — the Store API
-- uses limit/offset; cursor-based listing would require Medusa API support or a custom route).
--
-- Review your schema before running (\d product in psql). Apply during low traffic if needed.
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medusa_product_list_catalog
ON product (deleted_at, status, created_at DESC NULLS LAST);
