// 27 Nov: group order share page sizes + the cart convert-to-cart builds.
import { api, check, customer, db, describe, summary } from "./lib.mjs"

const RUN = Date.now().toString(36)
const S = (m, p, who, body) => api(m, p, { token: who.token, body })
const variants = (await db.query(
  `select v.id, v.title, p.id product_id from product_variant v join product p on p.id=v.product_id where p.handle='test-polo' and v.deleted_at is null`
)).rows
const V = (t) => variants.find((v) => v.title === t)
const design = (variantId) => ({
  version: 2, type: "fabric_customizer", method: "print", variantId,
  prints: [{ side: "front", sizeId: "up_to_a6", approxCm: { width: 9, height: 6 } }],
  artifacts: [{ side: "front", printFileUrl: "https://example.com/p.png", mockupUrl: "https://example.com/m.png", print_size_id: "up_to_a6" }],
  sideLayouts: {}, activeSide: "front",
})

describe("Group order: sizes offered and the cart it builds")
const owner = await customer(`goowner+${RUN}@club.example.com`, { first: "Gary", last: "Owner" })
const base = V("Navy / M")
check("fixture has a Navy / M polo", !!base, variants.map((v) => v.title))
let r = await S("POST", "/store/customers/me/designs", owner, { name: "GO test", base_product_id: base.product_id, base_variant_id: base.id, customizer_metadata: design(base.id) })
const des = r.body.design
r = await S("POST", "/store/group-orders", owner, {
  title: "GO test", owner_email: owner.email, owner_name: "Gary Owner",
  base_product_id: base.product_id, base_variant_id: base.id, base_design_id: des?.id, customizer_metadata: design(base.id),
})
check("group order created", r.status < 300, r.body)
const go = r.body.group_order

r = await api("GET", `/store/group-orders/${go.public_token}`)
const sizes = r.body.product_preview?.available_sizes ?? []
const navySizes = [...new Set(variants.filter((v) => v.title.startsWith("Navy / ")).map((v) => v.title.split(" / ")[1]))]
check(
  "share page offers the base colour's sizes only (no colours, no 'Colour / Size')",
  sizes.length === navySizes.length && navySizes.every((s) => sizes.includes(s)) && !sizes.some((s) => s.includes("/")),
  { sizes, navySizes }
)

r = await api("POST", `/store/group-orders/${go.public_token}/participants`, { body: { name: "Mem Ber", size_label: "M", quantity: 2 } })
check("member joins with size M", r.status < 300, r.body)
await S("POST", `/store/customers/me/group-orders/${go.id}/status`, owner, { status: "closed" })
r = await S("POST", `/store/customers/me/group-orders/${go.id}/convert-to-cart`, owner, {})
check("convert builds a cart with one line", r.status === 200 && !!r.body.cart_id && r.body.lines_added === 1, r.body)
const cart = (await db.query("select customer_id from cart where id=$1", [r.body.cart_id])).rows[0]
check("cart belongs to the organiser's login, not a new guest record", cart?.customer_id === owner.id, { cart, owner: owner.id })
const lines = (await db.query("select variant_id, quantity from cart_line_item where cart_id=$1 and deleted_at is null", [r.body.cart_id])).rows
check("line is Navy / M x2", lines.length === 1 && lines[0].variant_id === base.id && Number(lines[0].quantity) === 2, lines)

process.exit(summary("t10.json") ? 1 : 0)
