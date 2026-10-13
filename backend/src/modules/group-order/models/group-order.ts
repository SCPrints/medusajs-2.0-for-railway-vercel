import { model } from "@medusajs/framework/utils"

/**
 * A coach/admin/parent creates a group order — picks the base
 * garment + design, shares the link, parents/players each submit
 * their own size+name+number. When the owner closes the order, it
 * converts into a single cart and flows to the regular checkout.
 *
 * Status:
 *   open    — accepting participants
 *   closed  — owner stopped accepting; ready for owner to convert
 *   converted — owner has pushed it to cart/checkout
 *   expired — past deadline
 */
const GroupOrder = model
  .define("group_order", {
    id: model.id({ prefix: "go" }).primaryKey(),
    public_token: model.text(),
    status: model.enum(["open", "closed", "converted", "expired"]).default("open"),
    title: model.text(),
    organisation_name: model.text().nullable(),
    owner_customer_id: model.text().nullable(),
    owner_email: model.text(),
    owner_name: model.text().nullable(),
    base_product_id: model.text().nullable(),
    base_variant_id: model.text().nullable(),
    base_design_id: model.text().nullable(),
    /** Captures whatever the customer assembled in the customizer.
     *  Replayed when converting the group order into a real cart. */
    customizer_metadata: model.json().default({}),
    deadline_at: model.dateTime().nullable(),
    notes: model.text().nullable(),
    converted_order_ids: model.json().default({}),
    /**
     * Set when the group order is a bundle team order: every participant
     * picks a size per bundle item and the convert step adds the whole pack
     * through the priced bundle path (lib/bundle-lines.ts).
     */
    bundle_id: model.text().nullable(),
    /**
     * `{ artwork_url, notes, items: [{ bundle_item_id, product_handle, color }] }`
     * — the owner's pack choices (garment + colour per item). Artwork URL is
     * never exposed on the public page.
     */
    bundle_config: model.json().nullable(),
  })
  .indexes([
    { on: ["public_token"], unique: true },
    { on: ["owner_customer_id"] },
    { on: ["status"] },
  ])

export default GroupOrder
