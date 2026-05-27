import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Recovery script for the customer fulfillment service.
 *
 * Medusa's per-module migration tracker can fall out of sync with the
 * database in a few rare scenarios (e.g. an initial deploy that
 * partially ran migrations + recorded the tracker entry before the
 * actual SQL committed). When that happens, `medusa db:migrate`
 * reports "Database is up-to-date for module" but the table doesn't
 * actually exist.
 *
 * This script idempotently creates the `org_inventory` and
 * `org_inventory_movement` tables via raw SQL using the same SQL the
 * Migration20270601000000 file would have produced. Safe to run
 * multiple times (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT
 * EXISTS).
 *
 * Usage:
 *   cd /app/.medusa/server && npx medusa exec src/scripts/fix-org-inventory-tables.js
 *
 * After running, the inventory tab in /app/organisations should load
 * without errors.
 */
export default async function fixOrgInventoryTables({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  // Pull the database manager from the container — Medusa's
  // resolves a pg/knex client we can run raw SQL through.
  const pgConnection = container.resolve<any>("__pg_connection__")
  if (!pgConnection || typeof pgConnection.raw !== "function") {
    logger.error(
      "[fix-org-inventory-tables] pg connection not available on container. Falling back to direct pg client via DATABASE_URL."
    )
    await runViaDirectPg(logger)
    return
  }

  try {
    await pgConnection.raw(ORG_INVENTORY_SQL)
    await pgConnection.raw(ORG_INVENTORY_MOVEMENT_SQL)
    logger.info("[fix-org-inventory-tables] DONE via container pg connection")
  } catch (err: any) {
    logger.error(
      `[fix-org-inventory-tables] container pg connection failed: ${err?.message ?? err}. Falling back to DATABASE_URL.`
    )
    await runViaDirectPg(logger)
  }
}

async function runViaDirectPg(logger: { info: (m: string) => void; error: (m: string) => void }) {
  const url = process.env.DATABASE_URL
  if (!url) {
    logger.error("[fix-org-inventory-tables] DATABASE_URL not set — cannot run fallback")
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require("pg") as typeof import("pg")
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(ORG_INVENTORY_SQL)
    await client.query(ORG_INVENTORY_MOVEMENT_SQL)
    logger.info(
      "[fix-org-inventory-tables] DONE via direct pg client (DATABASE_URL)"
    )
  } finally {
    await client.end()
  }
}

const ORG_INVENTORY_SQL = `
  create table if not exists "org_inventory" (
    "id" text not null,
    "organisation_id" text not null,
    "product_variant_id" text not null,
    "organisation_design_id" text not null,
    "fulfillment_mode" text not null default 'held_stock',
    "unit_price" integer not null,
    "unit_cost" integer not null,
    "quantity_on_hand" integer not null default 0,
    "quantity_reserved" integer not null default 0,
    "reorder_point" integer null,
    "reorder_quantity" integer null,
    "lead_time_days" integer null,
    "customer_facing_label" text null,
    "is_active" boolean not null default true,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz null,
    constraint "org_inventory_pkey" primary key ("id")
  );
  create index if not exists "IDX_org_inventory_org_id"
    on "org_inventory" ("organisation_id") where "deleted_at" is null;
  create index if not exists "IDX_org_inventory_variant_id"
    on "org_inventory" ("product_variant_id") where "deleted_at" is null;
  create index if not exists "IDX_org_inventory_design_id"
    on "org_inventory" ("organisation_design_id") where "deleted_at" is null;
  create unique index if not exists "IDX_org_inventory_org_variant_design"
    on "org_inventory" ("organisation_id", "product_variant_id", "organisation_design_id")
    where "deleted_at" is null;
  create index if not exists "IDX_org_inventory_org_active"
    on "org_inventory" ("organisation_id", "is_active") where "deleted_at" is null;
`

const ORG_INVENTORY_MOVEMENT_SQL = `
  create table if not exists "org_inventory_movement" (
    "id" text not null,
    "org_inventory_id" text not null,
    "qty_delta" integer not null,
    "reason" text not null,
    "reference_type" text null,
    "reference_id" text null,
    "notes" text null,
    "created_by" text null,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz null,
    constraint "org_inventory_movement_pkey" primary key ("id")
  );
  create index if not exists "IDX_org_inventory_movement_inv_id"
    on "org_inventory_movement" ("org_inventory_id") where "deleted_at" is null;
  create index if not exists "IDX_org_inventory_movement_inv_created"
    on "org_inventory_movement" ("org_inventory_id", "created_at") where "deleted_at" is null;
  create index if not exists "IDX_org_inventory_movement_reference"
    on "org_inventory_movement" ("reference_type", "reference_id")
    where "deleted_at" is null and "reference_type" is not null;
`
