import type { ExecArgs } from "@medusajs/framework/types"

import { runSupplierCatalogSync, type CatalogSyncMode } from "../services/supplier-catalog-sync/run"

/**
 * Run the supplier catalog sync by hand.
 *
 *   MODE=report (default) — email + print what would change, write nothing
 *   MODE=apply            — add / hide for real
 *   ONLY=ascolour,fashionbiz,aussiepacific — limit suppliers
 *
 * Prod: cd /app/.medusa/server && MODE=report npx medusa exec src/scripts/sync-supplier-catalogs.js
 */
export default async function syncSupplierCatalogs({ container }: ExecArgs) {
  const mode = (process.env.MODE === "apply" ? "apply" : "report") as CatalogSyncMode
  const only = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const reports = await runSupplierCatalogSync(container, { mode, only })
  for (const r of reports) {
    console.log(`\n== ${r.supplier} (${r.mode})${r.error ? ` ERROR: ${r.error}` : ""}`)
    if (r.added.length) console.log(`added ${r.added.length}:`, r.added.map((l) => `${l.code} ${l.title}`).join(" | "))
    if (r.pending_add.length) console.log(`to add ${r.pending_add.length}:`, r.pending_add.map((l) => `${l.code} ${l.title}`).join(" | "))
    if (r.hidden.length) console.log(`to hide/hidden ${r.hidden.length}:`, r.hidden.map((l) => `${l.code} ${l.title} [${l.reason}]`).join(" | "))
    if (r.hide_blocked_reason) console.log(`hide blocked: ${r.hide_blocked_reason}`)
    if (r.add_errors.length) console.log(`problems:`, JSON.stringify(r.add_errors))
  }
}
