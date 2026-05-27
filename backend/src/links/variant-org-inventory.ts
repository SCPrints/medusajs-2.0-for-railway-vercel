import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"

import OrgInventoryModule from "../modules/org-inventory"

/**
 * One product variant has many inventory rows (one per organisation
 * that holds the variant in their fulfillment program, optionally with
 * different designs applied). `isList: true` on the variant side.
 *
 * Materialised via `npx medusa db:sync-links` after this file lands.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → module links.
 */
export default defineLink(
  ProductModule.linkable.productVariant,
  {
    linkable: OrgInventoryModule.linkable.orgInventory,
    isList: true,
  }
)
