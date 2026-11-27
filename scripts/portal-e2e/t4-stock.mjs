// Phase 4: destinations, held stock + pulls, split delivery, brand kit, roster.
import fs from "fs"
import { api, adminToken, check, checkout, db, describe, getCart, newCart, summary } from "./lib.mjs"

const st = JSON.parse(fs.readFileSync(new URL("./state.json", import.meta.url)))
const { org, other, owner, buyer, viewer, outsider, poloDesign } = st
const admin = await adminToken()
const A = (m, p, body) => api(m, p, { token: admin, body, store: false })
const S = (m, p, who, body) => api(m, p, { token: who.token, body })
const base = `/store/customers/me/organisations/${org.id}`
const sleep = (ms) => new Promise((x) => setTimeout(x, ms))

describe("Delivery destinations (staff-managed)")
const dest = async (o, name, city) =>
  (await A("POST", `/admin/organisations/${o}/destinations`, { name, address_1: "1 Base Rd", city, province: "NSW", postal_code: "2000", country_code: "au", contact_name: "Sgt Smith" })).body
let r = await A("POST", `/admin/organisations/${org.id}/destinations`, { name: "Depot Richmond", address_1: "Percival Rd", city: "Richmond", province: "NSW", postal_code: "2755", country_code: "au", contact_name: "Jo Jones" })
check("staff add a destination", r.status < 300, r.body)
const d1 = r.body.destination ?? r.body
const d2 = (await dest(org.id, "Depot Williamtown", "Williamtown")).destination
const dOther = (await dest(other.id, "Other org depot", "Melbourne")).destination
r = await S("GET", `${base}/destinations`, viewer)
check("any member sees the destinations", r.status === 200 && (r.body.destinations ?? []).length >= 2, r.body)
r = await S("GET", `${base}/destinations`, outsider)
check("outsider cannot", r.status === 404, r.status)

describe("Held stock")
r = await A("POST", `/admin/organisations/${org.id}/designs`, { name: "Crest polo (held stock)", thumbnail_url: "https://example.com/crest.png", customizer_metadata: { prints: [{ side: "front", sizeId: "up_to_a4" }] } })
check("staff add an organisation design", r.status < 300, r.body)
const orgDesign = r.body.design ?? r.body
r = await A("POST", `/admin/organisations/${org.id}/inventory`, { product_variant_id: st.V["test-polo|Navy / M"], organisation_design_id: orgDesign.id, fulfillment_mode: "held_stock", unit_price: 3500, unit_cost: 1800, reorder_point: 10, initial_quantity: 25, customer_facing_label: "Crest polo Navy M" })
check("staff add 25 held polos", r.status < 300, r.body)
const inv = r.body.inventory ?? r.body.row ?? r.body
r = await S("GET", `${base}/inventory`, viewer)
const row = (r.body.inventory ?? r.body.rows ?? r.body.items ?? []).find((x) => x.id === inv.id)
check("customer sees the stock row with 25 on hand", row && Number(row.quantity_on_hand ?? row.on_hand ?? row.quantity) === 25, row)
check("customer never sees our unit cost", !JSON.stringify(r.body).includes("unit_cost") && !JSON.stringify(r.body).includes("1800"), JSON.stringify(row))
r = await S("POST", `${base}/orders`, viewer, { destination_id: d1.id, items: [{ org_inventory_id: inv.id, quantity: 5 }] })
check("viewer cannot pull stock", r.status >= 400 && r.status !== 500, r.status)
r = await S("POST", `${base}/orders`, buyer, { destination_id: dOther.id, items: [{ org_inventory_id: inv.id, quantity: 5 }] })
check("cannot send to another organisation's address", r.status >= 400 && r.status !== 500, r.status)
// Pulling more than is held is allowed on purpose: the extra is printed (staff get a task).
const overStock = await rangeHeld()
async function rangeHeld() { return null }
r = await S("POST", `${base}/orders`, buyer, { destination_id: d1.id, items: [{ org_inventory_id: inv.id, quantity: 5 }], external_ref: "REQ-77", notes: "Gate 2" })
check("purchaser pulls 5 to Richmond", r.status < 300, r.body)
const pull = r.body.order ?? r.body
await sleep(1500)
r = await S("GET", `${base}/inventory`, owner)
const after = (r.body.inventory ?? r.body.rows ?? r.body.items ?? []).find((x) => x.id === inv.id)
check("stock: 25 on hand, 5 reserved, 20 available", after?.quantity_on_hand === 25 && after?.available === 20, after)
r = await S("GET", `${base}/orders`, viewer)
const pullRow = (r.body.orders ?? []).find((o) => o.id === (pull.id ?? pull.order_id))
check("pull shows in organisation orders as held stock", pullRow?.kind === "stock", pullRow ?? r.body.orders?.map((o) => [o.id, o.kind]))
r = await S("GET", `${base}/inventory/${inv.id}/movements`, viewer)
check("movement history lists the pull", r.status === 200 && JSON.stringify(r.body).includes("-5") || JSON.stringify(r.body).includes('"quantity":5'), JSON.stringify(r.body).slice(0, 400))
r = await A("POST", `/admin/organisations/${org.id}/inventory/${inv.id}/receive`, { quantity: 10, notes: "Reprint" })
check("staff receive 10 more", r.status < 300, r.body)
r = await A("POST", `/admin/organisations/${org.id}/inventory/${inv.id}/adjust`, { target_quantity: 29, notes: "Stocktake" })
check("staff stocktake adjust to 29", r.status < 300, r.body)
r = await S("POST", `${base}/orders/${pull.id ?? pull.order_id}/cancel`, buyer)
check("purchaser can cancel their held-stock pull", r.status < 300, { status: r.status, body: r.body })
await sleep(1500)
r = await S("GET", `${base}/inventory`, owner)
const back = (r.body.inventory ?? r.body.rows ?? r.body.items ?? []).find((x) => x.id === inv.id)
check("cancelled pull puts the 5 back (29 after the stocktake)", back?.available === 29 && back?.quantity_reserved === 0, back)
// Over-pull: 40 when 29 are free → accepted, 11 to print, customer never sees a negative.
r = await S("POST", `${base}/orders`, buyer, { destination_id: d1.id, items: [{ org_inventory_id: inv.id, quantity: 40 }] })
check("pulling more than is held is accepted (the extra is printed)", r.status < 300, r.body)
await sleep(2000)
const printTask = (await db.query(`select title, body from task where metadata->>'fulfillment_print_task' = 'true' order by created_at desc limit 1`)).rows[0]
check("staff get a print task for the 11 short", /11/.test(`${printTask?.title} ${printTask?.body}`), printTask)
r = await S("GET", `${base}/inventory`, viewer)
const neg = (r.body.inventory ?? r.body.rows ?? r.body.items ?? []).find((x) => x.id === inv.id)
check("customer sees 0 available, never a negative", neg?.available === 0, neg)
r = await S("GET", `/store/customers/me/organisations/${other.id}/inventory`, buyer)
check("CLUB purchaser cannot see another organisation's stock", r.status === 404, r.status)

describe("Split delivery")
const sc = await newCart(buyer.token)
await S("POST", `${base}/range/add-to-cart`, buyer, { cart_id: sc.id, items: [{ design_id: poloDesign.id, variant_id: st.V["test-polo|Navy / M"], quantity: 10 }] })
let cart = await getCart(sc.id, buyer.token)
const line = cart.items.find((i) => i.metadata?.source_design_id)
r = await S("POST", `/store/carts/${sc.id}`, buyer, { metadata: { split_delivery: [{ destination_id: d1.id, lines: [{ line_id: line.id, quantity: 6 }] }, { destination_id: d2.id, lines: [{ line_id: line.id, quantity: 3 }] }] } })
check("quantities that don't add up are refused", r.status === 400, r.status)
r = await S("POST", `/store/carts/${sc.id}`, buyer, { metadata: { split_delivery: [{ destination_id: d1.id, lines: [{ line_id: line.id, quantity: 6 }] }, { destination_id: dOther.id, lines: [{ line_id: line.id, quantity: 4 }] }] } })
check("another organisation's address is refused", r.status === 400, r.status)
r = await S("POST", `/store/carts/${sc.id}`, buyer, { metadata: { split_delivery: [{ destination_id: d1.id, lines: [{ line_id: line.id, quantity: 6 }] }, { destination_id: d2.id, lines: [{ line_id: line.id, quantity: 4 }] }] } })
check("6 to Richmond + 4 to Williamtown accepted", r.status === 200, r.body)
cart = await getCart(sc.id, buyer.token)
check("split snapshotted with names and addresses", cart.metadata?.split_delivery?.[0]?.name === "Depot Richmond" && /Percival/.test(cart.metadata.split_delivery[0].address), cart.metadata?.split_delivery)
r = await checkout(sc.id, buyer.token, { email: buyer.email, metadata: { cost_centre: "SQN-101" } })
check("split order placed", r.status === 200, { step: r.step, status: r.status, body: r.body })
await sleep(1500)
const oSplit = (await db.query(`select metadata from "order" where id=$1`, [r.body.order?.id])).rows[0]?.metadata
check("split delivery on the order for staff", Array.isArray(oSplit?.split_delivery) && oSplit.split_delivery.length === 2, oSplit?.split_delivery)

describe("Brand kit")
r = await S("POST", `${base}/brand-kit`, buyer, { colours: [{ name: "Hijack", hex: "#000000" }], fonts: [], placement_notes: "", logo_artwork_ids: [] })
const kitAfter = JSON.stringify((await db.query("select brand_kit from organisation where id=$1", [org.id])).rows[0]?.brand_kit)
check("purchaser cannot edit the brand kit (refused, unchanged)", r.status >= 400 && !kitAfter.includes("Hijack"), { status: r.status, kitAfter })
r = await S("POST", `${base}/brand-kit`, owner, { colours: [{ name: "Bad", hex: "blue" }], fonts: [], placement_notes: "", logo_artwork_ids: [] })
check("bad colour code refused", r.status === 400, r.status)
r = await S("POST", `${base}/brand-kit`, owner, { colours: [{ name: "Club Blue", hex: "#5d7fb9", pantone: "7454 C" }], fonts: ["Arial"], placement_notes: "Crest 8cm left chest", logo_artwork_ids: [] })
check("owner saves colours, font and placement", r.status === 200, r.body)
r = await S("GET", `${base}/brand-kit`, viewer)
check("viewer reads the brand kit", r.status === 200 && JSON.stringify(r.body).includes("7454 C"), r.body)
r = await S("GET", `${base}/brand-kit`, outsider)
check("outsider cannot", r.status === 404, r.status)

describe("Roster")
r = await S("POST", `${base}/roster`, viewer, { members: [{ name: "X" }] })
check("viewer cannot edit the roster", r.status >= 400, r.status)
r = await S("POST", `${base}/roster`, buyer, { members: [
  { name: "CDT Alex Brown", unit: "101 SQN", number: "7", sizes: { tops: "M" } },
  { name: "CDT Sam Green", unit: "101 SQN", sizes: { tops: "L" } },
  { name: "CDT Jo White", unit: "102 SQN", sizes: { tops: "S" } },
] })
check("purchaser adds 3 people", r.status < 300 && r.body.members?.length >= 3, r.body)
r = await S("GET", `${base}/roster`, viewer)
check("viewer reads the roster", r.status === 200 && r.body.members?.length >= 3 && r.body.can_edit === false, r.body.can_edit)
const roster = r.body.members

fs.writeFileSync(new URL("./state.json", import.meta.url), JSON.stringify({ ...st, d1, d2, roster }, null, 1))
process.exit(summary(new URL("./t4.json", import.meta.url).pathname) ? 1 : 0)
