import { model } from "@medusajs/framework/utils"

/**
 * A curated, staff-managed block of products shown on the storefront home page.
 *
 * Products are referenced by `product_handles` (an ORDERED string array stored
 * as `{ handles: [...] }`) rather than by product id — same deliberate choice as
 * the bundles module. Handles survive supplier re-imports (AS Colour / FashionBiz
 * / AP re-create rows with fresh ids), so a curated list keyed by handle won't
 * silently break when a product is re-imported. The array order is the display
 * order; the storefront skips any handle that no longer resolves and the admin
 * surfaces those as "unresolved" so staff can fix them.
 */
const HomeSection = model
  .define("home_section", {
    id: model.id({ prefix: "hsec" }).primaryKey(),
    handle: model.text(),
    title: model.text(),
    subtitle: model.text().nullable(),
    product_handles: model.json().default({}), // { handles: string[] } — ordered
    is_published: model.boolean().default(true),
    weight: model.number().default(0), // lower = earlier on the page
    created_by: model.text().nullable(),
  })
  .indexes([
    { on: ["handle"], unique: true },
    { on: ["is_published"] },
    { on: ["weight"] },
  ])

export default HomeSection
