# Archived scripts

This directory holds **one-shot scripts that have already been run** and are no
longer part of the active toolset. They're kept here (rather than deleted) so
the implementation is rediscoverable next time we need to do a similar job.

Excluded from the TypeScript build via `backend/tsconfig.json`, so stale type
references in these files never break the production build.

## When to use this directory

A script belongs here if **all three** of the following are true:

1. It has been **run to completion** at least once (bootstrap, backfill, one-off migration).
2. It is **not referenced** from `backend/package.json` scripts, any cron job
   under `backend/src/jobs/`, or any active doc (`CLAUDE.md`,
   `IMPORT_PRICING_RUNBOOK.md`).
3. Re-running it would not be part of normal operations — i.e. a fresh staging
   environment would not need it (those scripts live in `src/scripts/`).

If a script *might* be re-runnable later — e.g. supplier `cleanup-*` scripts
that re-trigger as new discontinued items appear — keep it in `src/scripts/`.

## Resurrecting an archived script

```bash
git mv backend/src/scripts.archive/<name>.ts backend/src/scripts/<name>.ts
# Optionally re-expose via backend/package.json scripts.
```

The script's git history is preserved across the move.

## Initial archive (2026-05-24)

14 scripts moved during the post-feature-spike cleanup. All confirmed to have
zero external imports and zero pnpm-alias / runbook references at the time of
archival.

Bootstrap (one-time):
- `create-ascolour-stock-location.ts`
- `create-product-types.ts`
- `disable-inventory-tracking.ts`
- `link-sales-channels-to-stock-locations.ts`
- `setup-au-store.ts`

Backfills (run, done):
- `backfill-as-colour-tier-prices.ts`
- `backfill-fashionbiz-tier-prices.ts`
- `backfill-variant-garment-images.ts`

One-shot pricing / catalog fixes:
- `reprice-as-colour-from-api.ts`
- `import-selected-as-colour-products.ts`

Image-asset fixes (run, done):
- `merge-ascolour-variant-images-into-template.ts`
- `patch-fashionbiz-garment-images.ts`
- `upgrade-ascolour-images-to-zoom.ts`
- `prune-broken-ascolour-images.ts`

Excluded from this round (still active):
- `backfill-ascolour-variants.ts` — wrapped by a cron job in
  `backend/src/jobs/backfill-ascolour-variants.ts`.
- `backfill-product-taxonomy.ts`, `backfill-product-types-tags.ts`,
  `backfill-canonical-cost.ts` — referenced from CLAUDE.md / docs as
  re-runnable utilities.
- `relink-supplier-brands.ts`, `verify-brand-links.ts` — ongoing brand-graph
  health tools per CLAUDE.md.
- All `cleanup-*` scripts — re-run as new supplier discontinued/clearance
  items appear.
- All `trim-*-catalog-by-allowlist.ts`, `import-*-from-api.ts`,
  `import-dnc-products.ts`, `generate-*.ts`, `audit-*.ts`,
  `apply-garment-images-from-template-csv.ts` — exposed as
  `backend/package.json` pnpm scripts.
- `seed.ts`, `seed-customer-tiers.ts`, `setup-shop-categories.ts` —
  documented in CLAUDE.md's first-time-setup checklist.
- `regenerate-tier-price-lists.ts`, `run-fashionbiz-inventory-sync.ts`,
  `sync-ascolour-inventory-now.ts` — manual rerun of cron-job logic.
- `reset-admin-auth.ts`, `delete-all-products.ts`, `test-shipping-tier.ts` —
  emergency / dev utilities.
- `list-product-types-and-tags.ts`, `deactivate-empty-brands.ts`,
  `cleanup-orphan-shop-categories.ts` — recurring audits/cleanups.
