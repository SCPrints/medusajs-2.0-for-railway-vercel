import type { MedusaContainer } from "@medusajs/framework/types"

import { runSupplierCatalogSync } from "../services/supplier-catalog-sync/run"

/**
 * Nightly supplier catalog sync: add new AS Colour / FashionBiz / Aussie
 * Pacific styles, hide ones they discontinue, email staff the report.
 * Gated by SUPPLIER_CATALOG_SYNC (off | report | apply) — see
 * services/supplier-catalog-sync/run.ts.
 *
 * 07:00 UTC (17:00 AEST): after the AS Colour variant backfill (06:30) and
 * the morning stock syncs, so the supplier locks are free.
 */
export default async function handler(container: MedusaContainer) {
  await runSupplierCatalogSync(container)
}

export const config = {
  name: "sync-supplier-catalogs",
  schedule: "0 7 * * *",
}
