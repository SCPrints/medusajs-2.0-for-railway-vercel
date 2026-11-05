import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { GARMENT_MEASUREMENT_MODULE } from "../modules/garment-measurement"
import type GarmentMeasurementModuleService from "../modules/garment-measurement/service"
import { SUPPLY_HOOD_5101 } from "./data/supply-hood-5101-measurements"

/**
 * Loads the Supply Hood 5101 measurements (5 taped sizes + 4 estimated) into
 * garment_measurement. Only adds rows that aren't there yet, so it never
 * overwrites what staff have measured in the admin. Re-runnable.
 *
 *   cd /app/.medusa/server && npx medusa exec src/scripts/seed-garment-measurements.js
 *   HANDLE=<other handle> to point it at a different product. DRY_RUN=1 previews.
 */
export default async function seedGarmentMeasurements({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve<GarmentMeasurementModuleService>(GARMENT_MEASUREMENT_MODULE)
  const handle = process.env.HANDLE || "as-colour-supply-hood-5101"
  const dry = process.env.DRY_RUN === "1"

  const { data } = await query.graph({ entity: "product", fields: ["id", "title"], filters: { handle } })
  const product = data?.[0]
  if (!product) {
    logger.error(`[seed-garment-measurements] no product with handle ${handle}; set HANDLE=`)
    return
  }

  const existing = await service.listGarmentMeasurements({ product_id: product.id }, { take: 5000 })
  const have = new Set(existing.map((r) => `${r.size}|${r.key}`))
  const rows = Object.entries(SUPPLY_HOOD_5101).flatMap(([size, { inferred, values }]) =>
    Object.entries(values)
      .filter(([key]) => !have.has(`${size}|${key}`))
      .map(([key, value_cm]) => ({
        product_id: product.id,
        garment_type: "hoodie",
        size,
        key,
        value_cm,
        estimated: inferred,
        note: inferred ? "Estimated from the taped sizes (infer_tape.py)" : "Taped by Sean, 4 Nov 2026",
        measured_by: null,
        measured_at: new Date(inferred ? "2026-11-05T00:00:00Z" : "2026-11-04T00:00:00Z"),
      }))
  )

  logger.info(
    `[seed-garment-measurements] ${product.title}: ${existing.length} rows already there, ${rows.length} to add${dry ? " (dry run)" : ""}`
  )
  if (!dry && rows.length) await service.createGarmentMeasurements(rows)
}
