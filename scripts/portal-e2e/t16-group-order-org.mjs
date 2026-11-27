// 28 Nov: a group order can be for an organisation; its cart (and so its
// order) carries the organisation, so it shows in the org's Orders tab.
import fs from "fs"
import { api, check, checkout, db, describe, summary } from "./lib.mjs"

const st = JSON.parse(fs.readFileSync(new URL("./state.json", import.meta.url)))
const { org, buyer, viewer, outsider } = st
const S = (m, p, who, body) => api(m, p, { token: who.token, body })
const variants = (await db.query(
  `select v.id, v.title, p.id product_id from product_variant v join product p on p.id=v.product_id where p.handle='test-polo' and v.deleted_at is null`
)).rows
const base = variants.find((v) => v.title === "Navy / M")
const design = {
  version: 2, type: "fabric_customizer", method: "print", variantId: base.id,
  prints: [{ side: "front", sizeId: "up_to_a6", approxCm: { width: 9, height: 6 } }],
  artifacts: [{ side: "front", printFileUrl: "https://example.com/p.png", mockupUrl: "https://example.com/m.png", print_size_id: "up_to_a6" }],
  sideLayouts: {}, activeSide: "front",
}
const goBody = (who, extra) => ({
  title: "Org GO test", owner_email: who.email, owner_name: "Org Buyer",
  base_product_id: base.product_id, base_variant_id: base.id, customizer_metadata: design, ...extra,
})

describe("Group order for an organisation")
const orgRow = (await db.query("select name from organisation where id=$1", [org.id])).rows[0]
let r = await S("POST", "/store/group-orders", outsider, goBody(outsider, { organisation_id: org.id }))
check("someone outside the organisation can't use it: 404", r.status === 404, r)
r = await S("POST", "/store/group-orders", viewer, goBody(viewer, { organisation_id: org.id }))
check("a viewer can't order for it: 404", r.status === 404, r)
r = await S("POST", "/store/group-orders", buyer, goBody(buyer, { organisation_id: org.id, organisation_name: "Typed name" }))
check("a purchaser creates one for the organisation", r.status === 201, r.body)
const go = r.body.group_order
check(
  "it stores the organisation, with its real name (not the typed one)",
  go?.organisation_id === org.id && go?.organisation_name === orgRow?.name,
  { id: go?.organisation_id, name: go?.organisation_name, expected: orgRow?.name }
)
r = await api("GET", `/store/group-orders/${go.public_token}`)
check("share page shows the organisation's name", r.body.group_order?.organisation_name === orgRow?.name, r.body.group_order)

r = await api("POST", `/store/group-orders/${go.public_token}/participants`, { body: { name: "Org Member", size_label: "M", quantity: 1 } })
check("member joins", r.status < 300, r.body)
await S("POST", `/store/customers/me/group-orders/${go.id}/status`, buyer, { status: "closed" })
r = await S("POST", `/store/customers/me/group-orders/${go.id}/convert-to-cart`, buyer, {})
check("convert builds a cart", r.status === 200 && !!r.body.cart_id, r.body)
const cart = (await db.query("select metadata from cart where id=$1", [r.body.cart_id])).rows[0]
check("the cart is for the organisation", cart?.metadata?.organisation_id === org.id, cart?.metadata)

// Place it (on account, as an organisation order) and look for it in the organisation's Orders.
await db.query("update organisation set account_terms_enabled = true where id = $1", [org.id])
const cartId = r.body.cart_id
const placed = await checkout(cartId, buyer.token, { email: buyer.email, metadata: { cost_centre: "SQN-101" } })
check("the organisation order is placed", placed.status === 200 && placed.body?.type === "order", { step: placed.step, status: placed.status, body: placed.body?.message ?? placed.body?.type })
const orderId = placed.body?.order?.id
r = await S("GET", `/store/customers/me/organisations/${org.id}/orders?limit=50`, buyer)
check("it shows in the organisation's Orders", (r.body.orders ?? []).some((o) => o.id === orderId), { orderId, listed: (r.body.orders ?? []).map((o) => o.id).slice(0, 5) })

r = await S("POST", "/store/group-orders", buyer, goBody(buyer, { organisation_name: "Just a club" }))
check("without one, it's a plain group order as before", r.status === 201 && r.body.group_order.organisation_id === null && r.body.group_order.organisation_name === "Just a club", r.body.group_order)
r = await S("POST", `/store/customers/me/group-orders/${r.body.group_order.id}/status`, buyer, { status: "closed" })

process.exit(summary("t16.json") ? 1 : 0)
