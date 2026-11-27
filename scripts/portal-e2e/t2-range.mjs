// Phase 2: the range, pricing by tier, ordering on account, organisation orders, re-ordering.
import fs from "fs"
import { api, adminToken, check, checkout, customer, db, describe, getCart, newCart, summary } from "./lib.mjs"

const st = JSON.parse(fs.readFileSync(new URL("./state.json", import.meta.url)))
const { org, owner, buyer, viewer, outsider } = st
const admin = await adminToken()
const A = (m, p, body) => api(m, p, { token: admin, body, store: false })
const S = (m, p, who, body) => api(m, p, { token: who.token, body })

const variants = (await db.query(`select v.id, v.title, p.handle, p.id product_id from product_variant v join product p on p.id=v.product_id where p.handle in ('test-polo','test-hoodie') and v.deleted_at is null`)).rows
const V = (handle, title) => variants.find((v) => v.handle === handle && v.title === title)
const polo = variants.find((v) => v.handle === "test-polo")

const design = (variantId, size = "up_to_a4", sides = ["front"]) => ({
  version: 2, type: "fabric_customizer", method: "print", variantId,
  prints: sides.map((side) => ({ side, sizeId: size, approxCm: { width: 20, height: 15 } })),
  artifacts: sides.map((side) => ({ side, printFileUrl: `https://example.com/print-${side}.png`, mockupUrl: `https://example.com/mock-${side}.png`, print_size_id: size })),
  sideLayouts: {}, activeSide: sides[0],
})

describe("Saved designs shared with the organisation")
let r = await S("POST", "/store/customers/me/designs", owner, { name: "Cadet polo (front crest)", base_product_id: polo.product_id, base_variant_id: V("test-polo", "Navy / M").id, customizer_metadata: design(V("test-polo", "Navy / M").id) })
check("owner saves a design", r.status === 200 || r.status === 201, r.body)
const poloDesign = r.body.design
r = await S("POST", `/store/customers/me/designs/${poloDesign.id}`, owner, { organisation_id: org.id })
check("owner shares it with the organisation", r.status === 200, r.body)
r = await S("POST", "/store/customers/me/designs", owner, { name: "Hoodie (front + back)", base_product_id: V("test-hoodie", "Black / M").product_id, base_variant_id: V("test-hoodie", "Black / M").id, customizer_metadata: design(V("test-hoodie", "Black / M").id, "up_to_a3", ["front", "back"]) })
const hoodieDesign = r.body.design
await S("POST", `/store/customers/me/designs/${hoodieDesign.id}`, owner, { organisation_id: org.id })
r = await S("POST", "/store/customers/me/designs", outsider, { name: "Outsider design", customizer_metadata: design(polo.id) })
const outsiderDesign = r.body.design
r = await S("POST", `/store/customers/me/designs/${outsiderDesign.id}`, outsider, { organisation_id: org.id })
check("outsider cannot share into CLUB", r.status >= 400, r.status)
r = await S("POST", `/store/customers/me/designs/${poloDesign.id}`, viewer, { name: "hijack" })
check("viewer cannot edit the owner's design", r.status >= 400, r.status)

describe("Range")
r = await S("GET", `/store/customers/me/organisations/${org.id}/range`, buyer)
check("purchaser sees both designs, both ready", r.body.items?.length === 2 && r.body.items.every((i) => i.ready), r.body.items?.map((i) => [i.name, i.ready, i.not_ready_reason]))
check("purchaser can order", r.body.can_order === true)
r = await S("GET", `/store/customers/me/organisations/${org.id}/range`, viewer)
check("viewer sees the range but cannot order", r.status === 200 && r.body.can_order === false, r.body.can_order)
r = await S("GET", `/store/customers/me/organisations/${org.id}/range`, outsider)
check("outsider: 404 on the range", r.status === 404, r.status)
r = await S("GET", `/store/customers/me/organisations/${org.id}/designs`, viewer)
check("designs list hides print files", r.status === 200 && !JSON.stringify(r.body).includes("print-front.png"), JSON.stringify(r.body).slice(0, 300))

describe("Price by tier")
const items = [
  { design_id: poloDesign.id, variant_id: V("test-polo", "Navy / M").id, quantity: 6 },
  { design_id: poloDesign.id, variant_id: V("test-polo", "Navy / L").id, quantity: 4 },
]
const buyerCart = await newCart(buyer.token)
r = await S("POST", `/store/customers/me/organisations/${org.id}/range/price`, buyer, { cart_id: buyerCart.id, items })
check("price route answers", r.status === 200 && r.body.total > 0, r.body)
const silverPrice = r.body
const unitSilver = silverPrice.lines?.[0]?.unit_price
// A non-member at no tier (member price) should pay more for the same thing.
const nobody = await customer(`nobody+${Date.now()}@shop.example.com`)
const nobodyCart = await newCart(nobody.token)
// price the same lines through a member of a second org with no tier
r = await A("POST", "/admin/organisations", { handle: `notier-${Date.now()}`, name: "No tier org" })
const noTierOrg = r.body.organisation ?? r.body
await A("POST", `/admin/organisations/${noTierOrg.id}/members`, { customer_id: nobody.id, role: "owner" })
await S("POST", `/store/customers/me/designs/${poloDesign.id}`, owner, { organisation_id: org.id })
const sharedForNobody = (await S("POST", "/store/customers/me/designs", nobody, { name: "Same polo", base_product_id: polo.product_id, base_variant_id: V("test-polo", "Navy / M").id, customizer_metadata: design(V("test-polo", "Navy / M").id) })).body.design
await S("POST", `/store/customers/me/designs/${sharedForNobody.id}`, nobody, { organisation_id: noTierOrg.id })
r = await S("POST", `/store/customers/me/organisations/${noTierOrg.id}/range/price`, nobody, { cart_id: nobodyCart.id, items: items.map((i) => ({ ...i, design_id: sharedForNobody.id })) })
check("Silver unit price is lower than no-tier price", unitSilver < r.body.lines?.[0]?.unit_price, { silver: unitSilver, none: r.body.lines?.[0]?.unit_price })
check("price includes no setup fee for a print (DTF) design", (silverPrice.setup_fees ?? []).length === 0, silverPrice.setup_fees)

describe("Add to cart from the range")
r = await S("POST", `/store/customers/me/organisations/${org.id}/range/add-to-cart`, viewer, { cart_id: buyerCart.id, items })
check("viewer cannot add to cart", r.status >= 400, r.status)
r = await S("POST", `/store/customers/me/organisations/${org.id}/range/add-to-cart`, outsider, { cart_id: buyerCart.id, items })
check("outsider cannot add to cart (404)", r.status === 404, r.status)
r = await S("POST", `/store/customers/me/organisations/${org.id}/range/add-to-cart`, buyer, { cart_id: (await newCart(owner.token)).id, items })
check("cannot add into someone else's cart", r.status === 404, r.status)
r = await S("POST", `/store/customers/me/organisations/${org.id}/range/add-to-cart`, buyer, { cart_id: buyerCart.id, items: [{ ...items[0], variant_id: V("test-hoodie", "Black / M").id }] })
check("a size from another garment is refused, nothing added", r.status >= 400 && (await getCart(buyerCart.id, buyer.token)).items.length === 0, r.body)
r = await S("POST", `/store/customers/me/organisations/${org.id}/range/add-to-cart`, buyer, { cart_id: buyerCart.id, items: [{ ...items[0], design_id: outsiderDesign.id }] })
check("a design from outside the range is refused", r.status === 404, r.status)
r = await S("POST", `/store/customers/me/organisations/${org.id}/range/add-to-cart`, buyer, { cart_id: buyerCart.id, items, packing: "by_size" })
check("purchaser adds 10 polos", r.status === 200 && r.body.added_lines === 2, r.body)
let cart = await getCart(buyerCart.id, buyer.token)
const garmentLines = cart.items.filter((i) => i.metadata?.source_design_id)
check("cart lines carry the organisation and the design", garmentLines.length === 2 && garmentLines.every((l) => l.metadata.organisation_id === org.id && l.metadata.customizerDesign?.prints?.length), garmentLines.map((l) => l.metadata))
check("cart charged the quoted unit price", Math.abs(garmentLines.find((l) => l.variant_id === items[0].variant_id).unit_price - unitSilver) < 0.011, { cart: garmentLines.map((l) => l.unit_price), quoted: unitSilver })
check("cart is tagged for the organisation", cart.metadata?.organisation_id === org.id, cart.metadata)
check("packing choice saved", cart.metadata?.packing === "by_size", cart.metadata)

describe("Checkout on account (fails closed)")
r = await checkout(buyerCart.id, buyer.token, { email: buyer.email })
check("without account terms, the no-card checkout is refused", r.status === 403 || r.status === 400, { step: r.step, status: r.status, body: r.body })
r = await A("POST", `/admin/organisations/${org.id}`, { account_terms_enabled: true, account_terms_days: 30, credit_limit: 5000, ap_email: "accounts@club.example.com" })
check("staff turn on 30-day account terms, $5,000 limit", r.status === 200, r.body)
r = await S("GET", `/store/customers/me/organisations/${org.id}/account?cart_id=${buyerCart.id}`, buyer)
check("account view: terms on, $5,000 available", r.body.account?.terms_enabled !== false && JSON.stringify(r.body).includes("5000"), r.body)
r = await checkout(buyerCart.id, viewer.token, { email: viewer.email })
check("a viewer cannot place the purchaser's cart", r.status >= 400, { step: r.step, status: r.status })
r = await checkout(buyerCart.id, buyer.token, { email: buyer.email, metadata: { po_number: "  PO-CLUB-0001  " } })
check("purchaser places the order on account", r.status === 200 && r.body.type === "order", { step: r.step, status: r.status, body: r.body })
const order1 = r.body.order
await new Promise((res) => setTimeout(res, 2500))
const o1 = (await db.query(`select metadata, display_id from "order" where id=$1`, [order1?.id])).rows[0]
check("order carries the organisation", o1?.metadata?.organisation_id === org.id, o1?.metadata)
check("PO number trimmed onto the order", o1?.metadata?.po_number === "PO-CLUB-0001", o1?.metadata?.po_number)
check("production stage starts at received", o1?.metadata?.production_stage === "received", o1?.metadata?.production_stage)

describe("Organisation orders and invoices")
r = await S("GET", `/store/customers/me/organisations/${org.id}/orders`, viewer)
const listed = (r.body.orders ?? []).find((o) => o.id === order1?.id)
check("viewer sees the order in the organisation's orders", !!listed, r.body)
check("…shows who placed it", listed?.placed_by_name?.includes("Pat"), listed)
r = await S("GET", `/store/customers/me/organisations/${org.id}/orders`, outsider)
check("outsider cannot list CLUB orders", r.status === 404, r.status)
r = await S("GET", `/store/customers/me/organisations/${org.id}/orders/${order1?.id}`, owner)
check("owner opens the colleague's order", r.status === 200, r.status)
r = await S("GET", `/store/customers/me/organisations/${org.id}/invoices`, viewer)
const inv = (r.body.invoices ?? []).find((i) => i.order_id === order1?.id)
check("viewer (accounts person) sees the invoice as outstanding", inv && inv.status !== "paid" && inv.balance > 0, inv)
check("invoice due in 30 days", inv?.due_at && Math.round((new Date(inv.due_at) - Date.now()) / 86400000) >= 29, inv?.due_at)
r = await S("GET", `/store/customers/me/orders/${order1?.id}/invoice`, viewer)
check("viewer can open the invoice", r.status === 200 && String(typeof r.body === "string" ? r.body : r.body?.html).includes("PO-CLUB-0001"), r.status)
r = await S("GET", `/store/customers/me/orders/${order1?.id}/invoice`, outsider)
check("outsider cannot open the invoice", r.status === 404, r.status)
r = await S("POST", `/store/customers/me/organisations/${org.id}/orders/${order1?.id}/cancel`, owner)
check("owner cannot cancel a colleague's paid order through the organisation page", r.status === 403, r.status)

describe("Colleagues re-order")
let oc = await newCart(owner.token)
r = await S("POST", `/store/customers/me/orders/${order1?.id}/order-again`, owner, { cart_id: oc.id })
check("owner orders the purchaser's order again", r.status === 200 && r.body.added_lines >= 2, r.body)
cart = await getCart(oc.id, owner.token)
check("re-order cart is tagged for the organisation", cart.metadata?.organisation_id === org.id, cart.metadata)
check("re-order lines point back at the original", cart.items.some((i) => i.metadata?.reorder_of), cart.items.map((i) => i.metadata?.reorder_of))
r = await S("POST", `/store/customers/me/orders/${order1?.id}/order-again`, viewer, { cart_id: (await newCart(viewer.token)).id })
check("viewer cannot re-order", r.status === 404 || r.status === 403, r.status)
r = await S("POST", `/store/customers/me/orders/${order1?.id}/order-again`, outsider, { cart_id: (await newCart(outsider.token)).id })
check("outsider cannot re-order", r.status === 404, r.status)

describe("Staff: put a job's designs in the range")
// A personal order by the owner (not tagged) that staff file under the organisation.
const pc = await newCart(owner.token)
await S("POST", `/store/carts/${pc.id}/line-items`, owner, { variant_id: V("test-polo", "White / S").id, quantity: 2, metadata: { customizerDesign: { ...design(V("test-polo", "White / S").id), group_id: "grp-personal-1" }, product_handle: "test-polo" } })
r = await checkout(pc.id, owner.token, { email: owner.email })
check("a personal card order without account terms is refused (no card step in tests)", r.status >= 400, r.status)
r = await A("GET", `/admin/orders/${order1?.id}/organisation-range`)
check("staff see the job's design groups", r.status === 200 && (r.body.groups ?? r.body.items ?? []).length >= 1, r.body)

fs.writeFileSync(new URL("./state.json", import.meta.url), JSON.stringify({ ...st, poloDesign, hoodieDesign, order1, V: Object.fromEntries(variants.map((v) => [`${v.handle}|${v.title}`, v.id])) }, null, 1))
process.exit(summary(new URL("./t2.json", import.meta.url).pathname) ? 1 : 0)
