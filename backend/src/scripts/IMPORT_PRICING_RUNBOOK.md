# Import Pricing Runbook (Non-Destructive)

This runbook keeps pricing imports safe and scoped so one brand import does not modify unrelated products.

## Pricing Contract

- `Variant Price AUD` is the **sell price for 100+ quantity**.
- If `BASE_SALE_PRICE`, `TIER_10_TO_49_PRICE`, and `TIER_50_TO_99_PRICE` are missing, tiers are derived from `Variant Price AUD` (100+ anchor) using brand multipliers.
- Script input values are dollars and are converted to minor units in code.

## Default Scope Rules

- `trim-ramo-catalog` and `trim-syzmik-catalog` run in **csv-only** status mode by default:
  - Only products present in the current CSV handle list are considered for status updates.
  - Unrelated products are untouched.
- Legacy brand-wide status behavior is opt-in with `--brand-status-sync`.

## Guardrails

Each trim run logs:

- `csv_rows`
- `tier_rows`
- `matched_variants`
- `unmatched_variants`
- `derived_tier_rows`
- `write_targets`
- coverage and min-match threshold

The run aborts if:

- match coverage is below threshold (`*_MIN_MATCH_RATIO`)
- any tier amount is below the floor (`*_MIN_MINOR_FLOOR`) unless `*_ALLOW_SUB_DOLLAR=1`

## Commands

Run from `backend/`.

### Ramo

```bash
# Dry run
pnpm run trim-ramo-catalog

# Apply
pnpm run trim-ramo-catalog -- --apply
```

Optional:

```bash
# Only if you intentionally want brand-wide publish/draft syncing
pnpm run trim-ramo-catalog -- --apply --brand-status-sync
```

Env guardrails:

- `RAMO_MIN_MATCH_RATIO` (default `0.75`)
- `RAMO_MIN_MINOR_FLOOR` (default `100`)
- `RAMO_ALLOW_SUB_DOLLAR=1` to permit sub-dollar tiers intentionally

### Syzmik

```bash
# Dry run
pnpm run trim-syzmik-catalog

# Apply
pnpm run trim-syzmik-catalog -- --apply
```

Optional:

```bash
# Only if you intentionally want brand-wide publish/draft syncing
pnpm run trim-syzmik-catalog -- --apply --brand-status-sync
```

Env guardrails:

- `SYZMIK_MIN_MATCH_RATIO` (default `0.75`)
- `SYZMIK_MIN_MINOR_FLOOR` (default `100`)
- `SYZMIK_ALLOW_SUB_DOLLAR=1` to permit sub-dollar tiers intentionally

## Safe Import Workflow

1. Prepare a single-brand CSV batch.
2. Run dry-run trim and review guardrail summary output.
3. Run apply trim.
4. Verify at least 3 SKUs (Explorer card + PDP page).
5. Revalidate storefront cache / reindex search if used.

## Quick Verification Checklist

- No guardrail aborts.
- `write_targets` is plausible for the CSV batch size.
- `unmatched_variants` is near zero or understood.
- No accidental `$0.xx` outputs unless intentionally configured.
