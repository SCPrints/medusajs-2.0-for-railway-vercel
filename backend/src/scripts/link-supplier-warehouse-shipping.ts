import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Links supplier stock locations to the existing "Australian Warehouse
 * delivery" fulfillment set so orders can actually be fulfilled from
 * where their stock and reservations already live.
 *
 * Background (2026-08): supplier importers put every inventory level at
 * their own location (AS Colour / FashionBiz / Aussie Pacific Warehouse,
 * ~26.5k levels combined), but only "Australian Warehouse" carries a
 * fulfillment set — and therefore the only shipping option. No location
 * had both stock and a shipping option, so the admin fulfilment modal
 * failed with "Inventory level for item … and location … not found" for
 * every order in the system.
 *
 * Backfilling levels onto Australian Warehouse was rejected: reservations
 * are created at the supplier location, so fulfilling elsewhere would
 * strand them, and the nightly supplier syncs only maintain the supplier
 * locations so the copies would go stale immediately.
 *
 * Idempotent and reversible:
 *   DRY_RUN=1   preview, no writes
 *   UNLINK=1    remove the links this script created
 *   LOCATIONS   comma-separated location names
 *               (default: "AS Colour Warehouse")
 *
 *   cd /app/.medusa/server && DRY_RUN=1 npx medusa exec src/scripts/link-supplier-warehouse-shipping.js
 *
 * Deliberately defaults to ONE location. Linking a location to the AU
 * fulfillment set could in principle surface a duplicate shipping option
 * at storefront checkout — verify checkout still shows exactly one
 * "Standard Shipping (AU)" before widening LOCATIONS to the other two.
 */
const DEFAULT_LOCATIONS = ["AS Colour Warehouse"]
const FULFILLMENT_SET_NAME = "Australian Warehouse delivery"

export default async function linkSupplierWarehouseShipping({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const link = container.resolve(ContainerRegistrationKeys.LINK) as any
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION) as any
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT) as any

  const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"
  const UNLINK = process.env.UNLINK === "1" || process.env.UNLINK === "true"
  const wanted = (process.env.LOCATIONS ?? DEFAULT_LOCATIONS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const tag = DRY_RUN ? "[link-shipping][DRY_RUN]" : "[link-shipping]"
  logger.info(
    `${tag} ${UNLINK ? "UNLINK" : "LINK"} — locations: ${wanted.join(", ")}`
  )

  const sets: any[] = await fulfillmentModule.listFulfillmentSets(
    { name: FULFILLMENT_SET_NAME },
    { take: 5 }
  )
  const set = sets?.[0]
  if (!set) {
    logger.error(
      `${tag} fulfillment set "${FULFILLMENT_SET_NAME}" not found — aborting.`
    )
    return
  }
  logger.info(`${tag} fulfillment set: ${set.name} (${set.id})`)

  const locations: Array<{ id: string; name: string }> =
    await stockLocationModule.listStockLocations({}, { take: 100 })

  // Existing links, so a re-run is a no-op rather than a duplicate row.
  const linkedSetIdsByLocation = new Map<string, Set<string>>()
  try {
    const { data } = await query.graph({
      entity: "stock_location",
      fields: ["id", "fulfillment_sets.id"],
      pagination: { take: 100, skip: 0 },
    })
    for (const l of (data ?? []) as any[]) {
      linkedSetIdsByLocation.set(
        l.id,
        new Set(((l.fulfillment_sets ?? []) as any[]).map((f) => f.id))
      )
    }
  } catch (err: any) {
    logger.error(`${tag} could not read existing links: ${err?.message ?? err}`)
    return
  }

  let changed = 0
  for (const name of wanted) {
    const loc = locations.find((l) => l.name === name)
    if (!loc) {
      logger.warn(`${tag} no stock location named "${name}" — skipping.`)
      continue
    }

    const alreadyLinked = linkedSetIdsByLocation.get(loc.id)?.has(set.id) ?? false
    const payload = {
      [Modules.STOCK_LOCATION]: { stock_location_id: loc.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: set.id },
    }

    if (UNLINK) {
      if (!alreadyLinked) {
        logger.info(`${tag} ${name}: not linked, nothing to remove.`)
        continue
      }
      logger.info(`${tag} ${name}: removing link → ${set.name}`)
      if (!DRY_RUN) await link.dismiss(payload)
      changed += 1
      continue
    }

    if (alreadyLinked) {
      logger.info(`${tag} ${name}: already linked, skipping.`)
      continue
    }
    logger.info(`${tag} ${name} (${loc.id}): linking → ${set.name}`)
    if (!DRY_RUN) await link.create(payload)
    changed += 1
  }

  logger.info(
    `${tag} done — ${changed} link(s) ${UNLINK ? "removed" : "created"}` +
      (DRY_RUN ? " (nothing written)." : ".")
  )

  if (!DRY_RUN && !UNLINK && changed > 0) {
    logger.info(
      `${tag} NEXT: open an affected order's fulfilment modal, pick the ` +
        `supplier warehouse, and confirm "Standard Shipping (AU)" appears ` +
        `and the item rows show real Available/In stock numbers. Then check ` +
        `storefront checkout still lists exactly one shipping option. ` +
        `Reverse with UNLINK=1 if either looks wrong.`
    )
  }
}
