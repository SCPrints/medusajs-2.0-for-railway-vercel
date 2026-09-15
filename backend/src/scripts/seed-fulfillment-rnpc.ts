import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { ORGANISATION_MODULE } from "../modules/organisation"
import type OrganisationModuleService from "../modules/organisation/service"
import { ORG_INVENTORY_MODULE } from "../modules/org-inventory"
import type OrgInventoryModuleService from "../modules/org-inventory/service"

/**
 * Seed the RNPC Pty Ltd fulfillment account (Plume / LifeGrain / Tsubu).
 *
 * RNPC orders through SinoraIQ; each PDF has an order ref shaped
 * `<brand-letter><site-code><per-brand-seq>` (PSCH00234, LLIV00019,
 * PUNSW00239) and item names shaped `<Brand> Tee (<Size>)`. The site
 * code becomes `organisation_destination.code`; the item name is stored
 * on `org_inventory.metadata.sinora_item_name` so order entry is a lookup.
 *
 *   cd /app/.medusa/server && npx medusa exec src/scripts/seed-fulfillment-rnpc.js
 *
 * Env:
 *   TEE_UNIT_COST_CENTS / HOODIE_UNIT_COST_CENTS  optional, default 0.
 *
 * Idempotent: org/designs/destinations/inventory rows keyed by handle /
 * code / (variant, design). OPENING_STOCK is applied only when a row is
 * first created — correct later counts via "Reconcile stocktake" in admin.
 */

// What SC Prints charges RNPC, inc-GST (HOLD cutover), from ServiceM8 jobs
// #2965 + #2940. Tee rates are per brand (Tsubu has a larger back print).
// The $17.27 on the SinoraIQ PDF is RNPC's internal transfer price —
// irrelevant to us. Only the order ref + quantities matter.
// ponytail: hoodie = $60 ex + $20 ex ordering fee folded in (#2965); #2940
// shows $57 ex and no fee — confirm which is current.
const HOODIE_UNIT_PRICE_CENTS = 8800

// Tee rows are `held_stock` = BLANK tees on the shelf. Every order is
// printed to the requested qty (even 1) from those blanks, so on_hand
// tracks blanks. Blanks are reordered from AS Colour 30 at a time when a
// size drops to 10 — that's reorder_point / reorder_quantity below. The
// order itself is the print instruction (it lands in /app/print-queue via
// production_stage like any other job) — no separate print task.
const TEE_REORDER_POINT = 10
const TEE_REORDER_QUANTITY = 30

// Fill in from the shelf count, key = "<Brand>/<SIZE>". Applied on row
// creation only.
const OPENING_STOCK: Record<string, number> = {
  // "Plume/S": 12,
}

const TEE_HANDLE = "as-colour-5026-5026"
const HOODIE_MENS_HANDLE = "ramo-tz612h"
const HOODIE_WOMENS_HANDLE = "ramo-fz99un"

// SinoraIQ size labels seen so far: Small / Medium / Large / XL.
// 2XL+ is a guess until an order shows one.
const SINORA_SIZE: Record<string, string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
  XL: "XL",
}

const BRANDS = [
  {
    name: "LifeGrain",
    code: "LG",
    ref_letter: "L",
    tee_colour: "JADE",
    tee_price_cents: 2805, // $25.50 ex
    hoodie_mens_colour: "Bottle Green",
    hoodie_womens_colour: null, // Ramo no longer offers bottle green in fz99un
  },
  {
    name: "Plume",
    code: "PLM",
    ref_letter: "P",
    tee_colour: "BERRY",
    // ponytail: #2940 has "Plume 3 position print" $8 ex × 19 on top of
    // $25.50 — unclear if that's every Plume tee. Confirm before prod.
    tee_price_cents: 2805,
    hoodie_mens_colour: "Maroon",
    hoodie_womens_colour: "Maroon",
  },
  {
    name: "Tsubu",
    code: "TSU",
    ref_letter: "T",
    tee_colour: "NAVY",
    tee_price_cents: 3245, // $29.50 ex — larger back print
    hoodie_mens_colour: null, // not confirmed
    hoodie_womens_colour: null,
  },
]

const DESTINATIONS = [
  {
    code: "PSCH",
    name: "Plume SCH Randwick",
    address_1: "High Street Entrance, Sydney Children's Hospital",
    address_2: "High Street",
    city: "Randwick",
    postal_code: "2031",
  },
  {
    code: "PUNSW",
    name: "Plume UNSW",
    address_1: "Quadrangle Building, E15, College Rd",
    address_2: null,
    city: "Kensington",
    postal_code: "2033",
  },
  {
    // SinoraIQ prints 2071 (Killara) — Liverpool is 2170. Corrected here
    // because this address is snapshotted onto every shipping label.
    code: "LLIV",
    name: "LifeGrain Liverpool",
    address_1: "Entrance J, Burnside Drive",
    address_2: null,
    city: "Liverpool",
    postal_code: "2170",
  },
]

export default async function seedFulfillmentRnpc({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orgService =
    container.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const invService =
    container.resolve<OrgInventoryModuleService>(ORG_INVENTORY_MODULE)
  const productModule = container.resolve(Modules.PRODUCT)

  const teeCost = Number(process.env.TEE_UNIT_COST_CENTS ?? 0)
  const hoodieCost = Number(process.env.HOODIE_UNIT_COST_CENTS ?? 0)

  // 1. Organisation
  let [org] = (await orgService.listOrganisations(
    { handle: "rnpc" },
    { take: 1 }
  )) as any[]
  if (!org) {
    ;[org] = await orgService.createOrganisations([
      {
        handle: "rnpc",
        name: "RNPC Pty Ltd",
        notes:
          "Plume / LifeGrain / Tsubu. Orders arrive as SinoraIQ PDFs — ref = <brand><site><seq>, e.g. PSCH00234.",
        tax_exempt: false,
      } as any,
    ])
    logger.info(`[seed] created organisation ${org.id}`)
  }

  // 2. Designs — one per brand
  const existingDesigns = (await orgService.listOrganisationDesigns(
    { organisation_id: org.id },
    { take: 50 }
  )) as any[]
  const designByCode = new Map(existingDesigns.map((d) => [d.code, d]))
  for (const b of BRANDS) {
    if (designByCode.has(b.code)) continue
    const [d] = await orgService.createOrganisationDesigns([
      {
        organisation_id: org.id,
        name: b.name,
        code: b.code,
        thumbnail_url: `https://placehold.co/400x400/eeeeee/333333?text=${encodeURIComponent(b.name)}`,
        print_file_url: null,
        is_active: true,
        metadata: {
          sinora_ref_letter: b.ref_letter,
          tee: { front: "left chest print", back: "A6 print" },
          hoodie: { front: "left chest embroidery" },
        },
      } as any,
    ])
    designByCode.set(b.code, d)
    logger.info(`[seed] created design ${b.name}`)
  }

  // 3. Destinations
  const existingDests = (await orgService.listOrganisationDestinations(
    { organisation_id: org.id },
    { take: 200 }
  )) as any[]
  const destCodes = new Set(existingDests.map((d) => d.code))
  const newDests = DESTINATIONS.filter((d) => !destCodes.has(d.code))
  if (newDests.length) {
    await orgService.createOrganisationDestinations(
      newDests.map((d) => ({
        organisation_id: org.id,
        ...d,
        province: "NSW",
        country_code: "au",
        is_active: true,
      })) as any[]
    )
    logger.info(`[seed] created ${newDests.length} destinations`)
  }

  // 4. Inventory rows
  const products = (await productModule.listProducts(
    { handle: [TEE_HANDLE, HOODIE_MENS_HANDLE, HOODIE_WOMENS_HANDLE] },
    { relations: ["variants"] }
  )) as any[]
  const byHandle = new Map(products.map((p) => [p.handle, p]))
  const variantsOf = (handle: string, colour: string) =>
    ((byHandle.get(handle)?.variants ?? []) as any[])
      .filter((v) => v.title?.toUpperCase().startsWith(`${colour.toUpperCase()} / `))
      .map((v) => ({ id: v.id, size: v.title.split(" / ")[1] }))

  const existingInv = (await invService.listOrgInventories(
    { organisation_id: org.id },
    { take: 500 }
  )) as any[]
  const invKeys = new Set(
    existingInv.map((r) => `${r.product_variant_id}:${r.organisation_design_id}`)
  )

  let created = 0
  const ensureRow = async (args: {
    design: any
    variant: { id: string; size: string }
    mode: "held_stock" | "print_on_demand"
    unit_price: number
    unit_cost: number
    reorder_point?: number
    reorder_quantity?: number
    label: string
    sinora_item_name: string
    opening?: number
  }) => {
    if (invKeys.has(`${args.variant.id}:${args.design.id}`)) return
    const [row] = (await invService.createOrgInventories([
      {
        organisation_id: org.id,
        product_variant_id: args.variant.id,
        organisation_design_id: args.design.id,
        fulfillment_mode: args.mode,
        unit_price: args.unit_price,
        unit_cost: args.unit_cost,
        reorder_point: args.reorder_point ?? null,
        reorder_quantity: args.reorder_quantity ?? null,
        customer_facing_label: args.label,
        is_active: true,
        metadata: { sinora_item_name: args.sinora_item_name },
      },
    ] as any[])) as any[]
    created++
    if (args.opening) {
      await invService.adjust({
        org_inventory_id: row.id,
        target_quantity: args.opening,
        notes: "Opening stock from seed-fulfillment-rnpc",
      })
    }
  }

  for (const b of BRANDS) {
    const design = designByCode.get(b.code)
    const tees = variantsOf(TEE_HANDLE, b.tee_colour)
    if (!tees.length) logger.warn(`[seed] no ${b.tee_colour} variants on ${TEE_HANDLE}`)
    for (const v of tees) {
      await ensureRow({
        design,
        variant: v,
        mode: "held_stock",
        unit_price: b.tee_price_cents,
        unit_cost: teeCost,
        reorder_point: TEE_REORDER_POINT,
        reorder_quantity: TEE_REORDER_QUANTITY,
        label: `${b.name} Tee — ${v.size}`,
        sinora_item_name: `${b.name} Tee (${SINORA_SIZE[v.size] ?? v.size})`,
        opening: OPENING_STOCK[`${b.name}/${v.size}`],
      })
    }

    for (const [handle, colour, fit] of [
      [HOODIE_MENS_HANDLE, b.hoodie_mens_colour, "Mens"],
      [HOODIE_WOMENS_HANDLE, b.hoodie_womens_colour, "Womens"],
    ] as const) {
      if (!colour) continue
      for (const v of variantsOf(handle, colour)) {
        await ensureRow({
          design,
          variant: v,
          mode: "print_on_demand",
          unit_price: HOODIE_UNIT_PRICE_CENTS,
          unit_cost: hoodieCost,
          label: `${b.name} ${fit} Hoodie — ${v.size}`,
          // ponytail: hoodie item-name format unseen; fix when an order shows one
          sinora_item_name: `${b.name} ${fit} Hoodie (${v.size})`,
        })
      }
    }
  }

  logger.info(`[seed] DONE. ${created} inventory rows created.
  Next: /app/organisations → RNPC Pty Ltd → set primary contact customer,
  upload real design artwork, set reorder points on the tee rows.`)
}
