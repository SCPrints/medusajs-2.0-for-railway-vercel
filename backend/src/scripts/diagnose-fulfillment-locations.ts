import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * READ-ONLY probe. Writes nothing.
 *
 * Answers the question "why can't we fulfil this order": which stock
 * locations exist, which of them carry inventory levels, which are wired
 * to a fulfillment set (and therefore offer shipping options), and where
 * a specific order's reservations actually sit.
 *
 * The 2026-08 symptom that prompted this: AS Colour products carry
 * inventory levels only at "AS Colour Warehouse", while the "Australia"
 * service zone — and so "Standard Shipping (AU)" — hangs off
 * "Australian Warehouse". No single location has both, so the admin
 * fulfilment modal fails with "Inventory level for item … and location …
 * not found" whichever location you pick.
 *
 *   cd /app/.medusa/server && ORDER_ID=order_01... npx medusa exec src/scripts/diagnose-fulfillment-locations.js
 *
 * ORDER_ID is optional — omit it for the catalog-wide picture only.
 */
export default async function diagnoseFulfillmentLocations({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION) as any
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT) as any
  const inventoryModule = container.resolve(Modules.INVENTORY) as any

  const line = (s = "") => logger.info(`[diagnose] ${s}`)

  // ---------------------------------------------------------------- 1. locations
  line("=".repeat(64))
  line("STOCK LOCATIONS")
  line("=".repeat(64))

  const locations: Array<{ id: string; name: string }> =
    await stockLocationModule.listStockLocations({}, { take: 100 })

  if (!locations?.length) {
    line("No stock locations found — nothing else will make sense. Stop here.")
    return
  }

  // Level counts per location. `metadata.count` is the total matching rows,
  // so take:1 keeps this cheap even on a 60k-variant catalog.
  const levelCountByLocation = new Map<string, number>()
  for (const loc of locations) {
    try {
      const { metadata } = await query.graph({
        entity: "inventory_level",
        fields: ["id"],
        filters: { location_id: loc.id },
        pagination: { take: 1, skip: 0 },
      })
      levelCountByLocation.set(loc.id, Number(metadata?.count ?? 0))
    } catch (err: any) {
      line(`  ! level count failed for ${loc.name}: ${err?.message ?? err}`)
    }
  }

  // Which locations can actually ship? A location offers shipping options
  // only via a fulfillment set linked to it.
  const setsByLocation = new Map<string, string[]>()
  try {
    const { data: locGraph } = await query.graph({
      entity: "stock_location",
      fields: ["id", "fulfillment_sets.id", "fulfillment_sets.name"],
      pagination: { take: 100, skip: 0 },
    })
    for (const l of (locGraph ?? []) as any[]) {
      setsByLocation.set(
        l.id,
        ((l.fulfillment_sets ?? []) as any[]).map((f) => f?.name ?? f?.id)
      )
    }
  } catch (err: any) {
    line(`  ! fulfillment_sets lookup failed: ${err?.message ?? err}`)
  }

  for (const loc of locations) {
    const levels = levelCountByLocation.get(loc.id) ?? 0
    const sets = setsByLocation.get(loc.id) ?? []
    line(`  ${loc.name}  (${loc.id})`)
    line(`      inventory levels : ${levels}`)
    line(
      `      fulfillment sets : ${sets.length ? sets.join(", ") : "NONE — cannot ship from here"}`
    )
  }

  // ------------------------------------------------------- 2. shipping options
  line("")
  line("=".repeat(64))
  line("SHIPPING OPTIONS BY SERVICE ZONE")
  line("=".repeat(64))
  try {
    const zones: any[] = await fulfillmentModule.listServiceZones({}, { take: 50 })
    for (const zone of zones ?? []) {
      const options: any[] = await fulfillmentModule.listShippingOptions(
        { service_zone_id: zone.id },
        { select: ["id", "name", "provider_id"], take: 100 }
      )
      line(`  zone "${zone.name}" (${zone.id})`)
      for (const o of options ?? []) {
        line(`      - ${o.name} [${o.provider_id}]`)
      }
      if (!options?.length) line("      (no options)")
    }
  } catch (err: any) {
    line(`  ! service zone walk failed: ${err?.message ?? err}`)
  }

  // ------------------------------------------------------------- 3. the order
  const orderId = process.env.ORDER_ID
  if (!orderId) {
    line("")
    line("ORDER_ID not set — skipping the per-order section.")
    return
  }

  line("")
  line("=".repeat(64))
  line(`ORDER ${orderId}`)
  line("=".repeat(64))

  const orderModule = container.resolve(Modules.ORDER) as any
  let order: any
  try {
    order = await orderModule.retrieveOrder(orderId, { relations: ["items"] })
  } catch (err: any) {
    line(`  ! could not retrieve order: ${err?.message ?? err}`)
    return
  }

  const items: any[] = order?.items ?? []
  line(`  ${items.length} line item(s)`)

  const skus = items
    .map((i) => i?.variant_sku)
    .filter((s): s is string => typeof s === "string" && s.length > 0)

  if (!skus.length) {
    line("  no variant SKUs on the line items — cannot map to inventory items.")
    return
  }

  // SKU → inventory_item, then every level that inventory item has anywhere.
  let inventoryItems: Array<{ id: string; sku: string }> = []
  try {
    const { data } = await query.graph({
      entity: "inventory_item",
      fields: ["id", "sku"],
      filters: { sku: skus },
    })
    inventoryItems = (data ?? []) as Array<{ id: string; sku: string }>
  } catch (err: any) {
    line(`  ! inventory_item lookup failed: ${err?.message ?? err}`)
    return
  }

  const locationName = new Map(locations.map((l) => [l.id, l.name]))

  for (const inv of inventoryItems) {
    line(`  SKU ${inv.sku}  → inventory_item ${inv.id}`)
    try {
      const { data: levels } = await query.graph({
        entity: "inventory_level",
        fields: ["id", "location_id", "stocked_quantity", "reserved_quantity"],
        filters: { inventory_item_id: inv.id },
      })
      if (!levels?.length) {
        line("      levels: NONE ANYWHERE — this item can never be fulfilled")
      }
      for (const lvl of (levels ?? []) as any[]) {
        line(
          `      level @ ${locationName.get(lvl.location_id) ?? lvl.location_id}` +
            ` — stocked ${lvl.stocked_quantity}, reserved ${lvl.reserved_quantity}`
        )
      }
    } catch (err: any) {
      line(`      ! level lookup failed: ${err?.message ?? err}`)
    }
  }

  // Reservations tell us which location Medusa picked at order placement —
  // the fulfilment has to agree with this or inventory won't reconcile.
  line("")
  line("  RESERVATIONS")
  try {
    const reservations: any[] = await inventoryModule.listReservationItems(
      { line_item_id: items.map((i) => i.id) },
      { take: 100 }
    )
    if (!reservations?.length) {
      line("    none — items are not allocated to any location")
    }
    for (const r of reservations ?? []) {
      line(
        `    ${r.inventory_item_id} × ${r.quantity} @ ` +
          `${locationName.get(r.location_id) ?? r.location_id}`
      )
    }
  } catch (err: any) {
    line(`    ! reservation lookup failed: ${err?.message ?? err}`)
  }

  line("")
  line("Done. Nothing was written.")
}
