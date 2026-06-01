import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Migrate the live AU region from the old shipping setup (flat Standard +
 * Express + blank-carrier ShipStation/AusPost "live quote" options) to a single
 * weight-based "Standard Shipping (AU)" option served by the in-house `scp_scp`
 * provider.
 *
 * What it does (idempotent):
 *   0. Enable the `scp_scp` fulfillment provider on every stock location — it
 *      must be enabled on the location, not just registered in medusa-config,
 *      or createShippingOptions rejects it.
 *   1. Soft-delete the old AU options (manual_* / shipstation_* / auspost_*) so
 *      Express + the broken live-quote rows disappear from checkout + admin.
 *      Soft delete keeps historical order references intact (reversible).
 *   2. Ensure the `scp_scp` "Standard Shipping (AU)" calculated option exists
 *      in the "Australia" service zone.
 *
 * Run AFTER deploying the backend that registers the scp provider:
 *   cd /app/.medusa/server && npx medusa exec src/scripts/reconfigure-shipping-weight-based.js
 * Preview first with DRY_RUN=1 (no writes).
 */
export default async function reconfigureShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fulfillment = container.resolve(Modules.FULFILLMENT) as any
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION) as any
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const DRY_RUN =
    process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"

  if (DRY_RUN) {
    logger.info("[reconfigure-shipping] DRY_RUN=1 — no changes will be written.")
  }

  const zones = await fulfillment.listServiceZones({ name: "Australia" })
  const auZone = zones?.[0]
  if (!auZone) {
    logger.error(
      "[reconfigure-shipping] No 'Australia' service zone found — aborting. (Has the fulfillment data been seeded?)"
    )
    return
  }

  const profiles = await fulfillment.listShippingProfiles({})
  const defaultProfile =
    profiles?.find((p: any) => p?.name === "Default Shipping Profile") ??
    profiles?.[0]
  if (!defaultProfile) {
    logger.error(
      "[reconfigure-shipping] No shipping profile found — aborting."
    )
    return
  }

  const auOptions: Array<{ id: string; name?: string; provider_id?: string }> =
    await fulfillment.listShippingOptions(
      { service_zone_id: auZone.id },
      { select: ["id", "name", "provider_id"], take: 1000 }
    )

  const scpExisting = auOptions.filter((o) =>
    (o.provider_id ?? "").startsWith("scp_")
  )
  const toDelete = auOptions.filter((o) => {
    const pid = o.provider_id ?? ""
    return (
      pid.startsWith("manual_") ||
      pid.startsWith("shipstation_") ||
      pid.startsWith("auspost_")
    )
  })

  logger.info(
    `[reconfigure-shipping] AU zone "${auZone.name}" (${auZone.id}): ${auOptions.length} option(s) total, ` +
      `${scpExisting.length} already scp_*, ${toDelete.length} legacy option(s) to retire.`
  )
  for (const o of toDelete) {
    logger.info(`[reconfigure-shipping]   retire → ${o.name} [${o.provider_id}] (${o.id})`)
  }

  // 0. Enable the scp_scp provider on every stock location BEFORE any
  //    create/delete. Registering the provider in medusa-config is NOT enough —
  //    createShippingOptions validates the provider is enabled for the location,
  //    so without this the create throws "Providers (scp_scp) are not enabled
  //    for the service location" (which is exactly what stranded the AU zone
  //    with zero options on the first run). Placed before the destructive steps
  //    so a failure here aborts safely (nothing deleted yet). Idempotent:
  //    link.create throws on an existing link, which we treat as already-enabled.
  const allLocations = (await stockLocationModule.listStockLocations(
    {},
    { take: 1000 }
  )) as Array<{ id: string; name?: string }>
  for (const loc of allLocations ?? []) {
    if (DRY_RUN) {
      logger.info(
        `[reconfigure-shipping] would enable scp_scp on location "${loc.name}" (${loc.id}).`
      )
      continue
    }
    try {
      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: loc.id },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: "scp_scp" },
      })
      logger.info(
        `[reconfigure-shipping] Enabled scp_scp on location "${loc.name}" (${loc.id}).`
      )
    } catch (err) {
      logger.info(
        `[reconfigure-shipping] scp_scp already enabled on "${loc.name}" (or link skipped): ${
          (err as Error).message
        }`
      )
    }
  }

  // 1. Retire the legacy options first so the new option can reuse the
  //    "standard_au" code without colliding. Soft delete = reversible + keeps
  //    historical order references intact. Non-fatal: even if this fails, the
  //    scp option below + the /store/cart-shipping-options scp filter still
  //    hide the old options from checkout.
  if (toDelete.length && !DRY_RUN) {
    const ids = toDelete.map((o) => o.id)
    try {
      if (typeof fulfillment.softDeleteShippingOptions === "function") {
        await fulfillment.softDeleteShippingOptions(ids)
      } else {
        await fulfillment.deleteShippingOptions(ids)
      }
      logger.info(`[reconfigure-shipping] Retired ${ids.length} legacy option(s).`)
    } catch (err) {
      logger.warn(
        `[reconfigure-shipping] Failed to retire some legacy options: ${
          (err as Error).message
        }. Continuing — the scp option + route filter still hide them from checkout. ` +
          "You can also delete them by hand in Admin → Settings → Locations & Shipping."
      )
    }
  }

  // 2. Ensure the single weight-based option exists.
  if (scpExisting.length === 0) {
    if (!DRY_RUN) {
      await createShippingOptionsWorkflow(container).run({
        input: [
          {
            name: "Standard Shipping (AU)",
            price_type: "calculated",
            provider_id: "scp_scp",
            service_zone_id: auZone.id,
            shipping_profile_id: defaultProfile.id,
            type: {
              label: "Standard",
              description: "Calculated by weight (Australia-wide).",
              code: "standard_au",
            },
            data: {},
            rules: [
              { attribute: "enabled_in_store", value: "true", operator: "eq" },
              { attribute: "is_return", value: "false", operator: "eq" },
            ],
          },
        ],
      })
    }
    logger.info(
      "[reconfigure-shipping] Created weight-based 'Standard Shipping (AU)' (provider scp_scp)."
    )
  } else {
    logger.info(
      `[reconfigure-shipping] scp option already present (${scpExisting.length}) — leaving as-is.`
    )
  }

  logger.info(
    `[reconfigure-shipping] Done.${
      DRY_RUN ? " (DRY_RUN — nothing written.)" : ""
    } Storefront now shows one weight-based Standard Shipping option.`
  )
}
