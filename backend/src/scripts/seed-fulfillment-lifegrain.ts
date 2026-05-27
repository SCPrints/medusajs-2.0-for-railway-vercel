import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { ORGANISATION_MODULE } from "../modules/organisation"
import type OrganisationModuleService from "../modules/organisation/service"
import { ORG_INVENTORY_MODULE } from "../modules/org-inventory"
import type OrgInventoryModuleService from "../modules/org-inventory/service"

/**
 * Seed script for the Lifegrain Cafe customer fulfillment service —
 * Phase 1 baseline. Bootstraps the organisation, its 8 placeholder
 * designs, its store network destinations, and a handful of sample
 * inventory rows with starting on-hand quantities pulled from the
 * Uniforms November 2022 spreadsheet snapshot.
 *
 * Usage (local):
 *   cd backend && npx medusa exec src/scripts/seed-fulfillment-lifegrain.ts
 *
 * Idempotent: re-running won't create duplicates (handle uniqueness on
 * the org; name+org uniqueness on designs/destinations). Existing rows
 * are skipped, not updated.
 *
 * What it does NOT do:
 *   - Upload real thumbnails / print files. Placeholder URLs only.
 *     Replace via the Designs tab in admin after first run.
 *   - Set primary_contact_customer_id. You must paste a real customer ID
 *     on the Overview tab before fulfillment orders can be placed.
 *   - Create the product variants. Those must already exist in the
 *     catalog. Set FULFILLMENT_SEED_LIFEGRAIN_VARIANT_ID=variant_xyz
 *     to seed one starter inventory row tied to a real variant.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md for the full spec.
 */
export default async function seedFulfillmentLifegrain({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orgService =
    container.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const invService =
    container.resolve<OrgInventoryModuleService>(ORG_INVENTORY_MODULE)

  // 1. Organisation
  const orgHandle = "lifegrain-cafe"
  let organisation: any
  const existing = (await orgService.listOrganisations(
    { handle: orgHandle },
    { take: 1 }
  )) as any[]
  if (existing.length > 0) {
    organisation = existing[0]
    logger.info(`[seed] organisation already exists: ${organisation.id}`)
  } else {
    ;[organisation] = await orgService.createOrganisations([
      {
        handle: orgHandle,
        name: "Lifegrain Cafe",
        contact_email: "orders@lifegrain.example.com",
        notes:
          "Multi-location café chain. Drop-ships uniforms from SC Prints to each café. See Docs/FULFILLMENT_PHASE_1_SPEC.md.",
        tax_exempt: false,
      } as any,
    ])
    logger.info(`[seed] created organisation ${organisation.id}`)
  }

  // 2. Designs — 8 placeholder slots
  const designSeeds = [
    { name: "Lifegrain Logo White", code: "LG-WHITE" },
    { name: "Lifegrain Logo Black", code: "LG-BLACK" },
    { name: "Lifegrain Embroidered Crest", code: "LG-CREST" },
    { name: "Lifegrain Slogan Banner", code: "LG-SLOGAN" },
    { name: "Plume Wordmark White", code: "PLM-WHITE" },
    { name: "Plume Wordmark Charcoal", code: "PLM-CHAR" },
    { name: "Tsubu Brand Stamp", code: "TSU-STAMP" },
    { name: "Tsubu Wordmark", code: "TSU-WORD" },
  ]
  const existingDesigns = (await orgService.listOrganisationDesigns(
    { organisation_id: organisation.id },
    { take: 50 }
  )) as any[]
  const existingDesignNames = new Set(
    existingDesigns.map((d) => d.name)
  )
  const designsToCreate = designSeeds.filter(
    (d) => !existingDesignNames.has(d.name)
  )
  if (designsToCreate.length > 0) {
    const created = await orgService.createOrganisationDesigns(
      designsToCreate.map((d) => ({
        organisation_id: organisation.id,
        name: d.name,
        code: d.code,
        thumbnail_url:
          `https://placehold.co/400x400/eeeeee/333333?text=${encodeURIComponent(d.name)}`,
        print_file_url: null,
        is_active: true,
      })) as any[]
    )
    logger.info(`[seed] created ${created.length} designs`)
  } else {
    logger.info(`[seed] all designs already exist`)
  }

  // 3. Destinations from the Uniforms November 2022 spreadsheet
  const destinationSeeds = [
    {
      name: "Lifegrain Sutherland Hospital",
      code: "LG-SUTH-HOSP",
      address_1: "Sutherland Hospital",
      city: "Caringbah",
      province: "NSW",
      postal_code: "2229",
    },
    {
      name: "Lifegrain Liverpool",
      code: "LG-LIV",
      address_1: "Westfield Liverpool",
      city: "Liverpool",
      province: "NSW",
      postal_code: "2170",
    },
    {
      name: "Lifegrain Randwick",
      code: "LG-RAND",
      address_1: "Spot Festival, The Spot",
      city: "Randwick",
      province: "NSW",
      postal_code: "2031",
    },
    {
      name: "Lifegrain Sutherland",
      code: "LG-SUTH",
      address_1: "Westfield Sutherland",
      city: "Sutherland",
      province: "NSW",
      postal_code: "2232",
    },
    {
      name: "Lifegrain Hornsby Ku-Ring-Gai Hospital",
      code: "LG-HORN-HOSP",
      address_1: "Hornsby Ku-Ring-Gai Hospital",
      city: "Hornsby",
      province: "NSW",
      postal_code: "2077",
    },
    {
      name: "Lifegrain UNSW Quadrangle",
      code: "LG-UNSW",
      address_1: "UNSW Campus Quadrangle Bldg",
      city: "Kensington",
      province: "NSW",
      postal_code: "2052",
    },
    {
      name: "Plume Liverpool",
      code: "PLM-LIV",
      address_1: "Westfield Liverpool",
      city: "Liverpool",
      province: "NSW",
      postal_code: "2170",
    },
    {
      name: "Plume Randwick",
      code: "PLM-RAND",
      address_1: "Spot Festival, The Spot",
      city: "Randwick",
      province: "NSW",
      postal_code: "2031",
    },
    {
      name: "Plume Hurstville",
      code: "PLM-HURST",
      address_1: "Westfield Hurstville",
      city: "Hurstville",
      province: "NSW",
      postal_code: "2220",
    },
    {
      name: "Tsubu Liverpool",
      code: "TSU-LIV",
      address_1: "Westfield Liverpool",
      city: "Liverpool",
      province: "NSW",
      postal_code: "2170",
    },
    {
      name: "Tsubu Randwick",
      code: "TSU-RAND",
      address_1: "Spot Festival, The Spot",
      city: "Randwick",
      province: "NSW",
      postal_code: "2031",
    },
  ]
  const existingDests = (await orgService.listOrganisationDestinations(
    { organisation_id: organisation.id },
    { take: 100 }
  )) as any[]
  const existingDestNames = new Set(existingDests.map((d) => d.name))
  const destsToCreate = destinationSeeds.filter(
    (d) => !existingDestNames.has(d.name)
  )
  if (destsToCreate.length > 0) {
    const created = await orgService.createOrganisationDestinations(
      destsToCreate.map((d) => ({
        organisation_id: organisation.id,
        name: d.name,
        code: d.code,
        address_1: d.address_1,
        city: d.city,
        province: d.province,
        postal_code: d.postal_code,
        country_code: "au",
        is_active: true,
      })) as any[]
    )
    logger.info(`[seed] created ${created.length} destinations`)
  } else {
    logger.info(`[seed] all destinations already exist`)
  }

  // 4. Sample inventory row — only if FULFILLMENT_SEED_LIFEGRAIN_VARIANT_ID
  //    is set in the env. Without a real variant we'd create a dangling
  //    row referencing a non-existent variant.
  const sampleVariantId = process.env.FULFILLMENT_SEED_LIFEGRAIN_VARIANT_ID
  if (sampleVariantId) {
    const freshDesigns = (await orgService.listOrganisationDesigns(
      { organisation_id: organisation.id, name: "Lifegrain Logo White" },
      { take: 1 }
    )) as any[]
    const sampleDesign = freshDesigns[0]
    if (sampleDesign) {
      const existingInv = (await invService.listOrgInventories(
        {
          organisation_id: organisation.id,
          product_variant_id: sampleVariantId,
          organisation_design_id: sampleDesign.id,
        },
        { take: 1 }
      )) as any[]
      if (existingInv.length === 0) {
        const [created] = (await invService.createOrgInventories([
          {
            organisation_id: organisation.id,
            product_variant_id: sampleVariantId,
            organisation_design_id: sampleDesign.id,
            fulfillment_mode: "held_stock",
            unit_price: 1400, // $14.00
            unit_cost: 650, // $6.50
            quantity_on_hand: 0,
            quantity_reserved: 0,
            reorder_point: 10,
            reorder_quantity: 60,
            is_active: true,
          },
        ] as any[])) as any[]
        // Seed 50 starting units via adjust
        await invService.adjust({
          org_inventory_id: created.id,
          target_quantity: 50,
          notes: "Initial seed from Uniforms Nov 2022 spreadsheet",
        })
        logger.info(
          `[seed] created sample inventory row ${created.id} with 50 starting units`
        )
      } else {
        logger.info(`[seed] sample inventory row already exists`)
      }
    }
  } else {
    logger.info(
      "[seed] FULFILLMENT_SEED_LIFEGRAIN_VARIANT_ID not set — skipping sample inventory row. " +
        "Set it to a real product_variant.id to seed one."
    )
  }

  // 5. Reminder for the operator
  logger.info(`
[seed] DONE.

Next steps:

  1. Open /app/organisations and pick "Lifegrain Cafe".
  2. On the Overview tab, paste a real customer ID into
     "Primary contact customer". Fulfillment order entry is
     blocked until this is set.
  3. On the Designs tab, replace placeholder thumbnails with the
     real artwork files.
  4. On the Inventory tab, create rows pairing each design with
     real product variants from the catalog (LifeGrain S/M/L/XL,
     Plume S-XL, Tsubu S-XL, etc.). Set fulfillment_mode, prices,
     and reorder configuration per the spreadsheet.
  5. Test by placing an order at /app/fulfillment/new and walking
     it through the production stages.

  See Docs/FULFILLMENT_PHASE_1_SPEC.md for full context.
`)
}
