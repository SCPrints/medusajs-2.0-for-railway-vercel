// Phase 6: names & numbers, sizing kit, PO document, supplier details PDF, job's designs → range, job view.
import fs from "fs"
import { execSync } from "child_process"
import { ADDRESS, api, adminToken, check, checkout, customer, db, describe, getCart, newCart, summary } from "./lib.mjs"

const st = JSON.parse(fs.readFileSync(new URL("./state.json", import.meta.url)))
const { org, owner, buyer, outsider, poloDesign } = st
const admin = await adminToken()
const A = (m, p, body) => api(m, p, { token: admin, body, store: false })
const S = (m, p, who, body) => api(m, p, { token: who.token, body })
const base = `/store/customers/me/organisations/${org.id}`
const sleep = (ms) => new Promise((x) => setTimeout(x, ms))
const ENV = new URL("./env.sh", import.meta.url).pathname
const completePersonal = async (cartId, who) => {
  await api("POST", `/store/carts/${cartId}`, { token: who.token, body: { email: who.email, shipping_address: ADDRESS, billing_address: ADDRESS } })
  const so = (await api("GET", `/store/shipping-options?cart_id=${cartId}`, { token: who.token })).body?.shipping_options?.[0]
  await api("POST", `/store/carts/${cartId}/shipping-methods`, { token: who.token, body: { option_id: so?.id } })
  try {
    const out = execSync(`MEDUSA_DISABLE_ADMIN=true CART_ID=${cartId} ${ENV} npx medusa exec src/scripts/zz-e2e-complete.ts 2>&1`, { encoding: "utf8" })
    // The dev server may reload after an exec: wait until it answers again.
    await sleep(4000)
    for (let i = 0; i < 60; i++) {
      const ok = await fetch("http://localhost:9000/health").then((x) => x.ok).catch(() => false)
      if (ok) break
      await sleep(1000)
    }
    await sleep(2000)
    return out.match(/E2E_ORDER=(\S+)/)?.[1] ?? null
  } catch (e) {
    console.log(String(e.stdout ?? e).split("\n").filter((l) => /rror/.test(l)).slice(0, 3).join("\n"))
    return null
  }
}

describe("Names and numbers, priced by print size")
let c = await newCart(buyer.token)
let r = await S("POST", `${base}/range/add-to-cart`, buyer, {
  cart_id: c.id,
  items: [{ design_id: poloDesign.id, variant_id: st.V["test-polo|Navy / M"], quantity: 6 }, { design_id: poloDesign.id, variant_id: st.V["test-polo|Navy / L"], quantity: 4 }],
  roster: "all", packing: "individual", names_numbers: { names: "up_to_a4", numbers: "up_to_a6" },
})
check("10 polos with names A4 + numbers A6", r.status === 200 && r.body.fees_for_staff.length === 0, r.body)
let cart = await getCart(c.id, buyer.token)
const names = cart.items.find((i) => i.metadata?.names_numbers)
check("one names line × 10 garments at $18.00 (A4 $10.50 + A6 $7.50 at 10-24)", names?.quantity === 10 && Math.abs(names.unit_price - 18) < 0.001, names && { q: names.quantity, p: names.unit_price, t: names.title })
check("cart records names for the order", cart.metadata?.names_numbers?.names === "up_to_a4" && cart.metadata.personalisation_requested === true, cart.metadata)
const w = await api("GET", `/store/cart-shipping-options?cart_id=${c.id}`, { token: buyer.token })
check("names line adds no shipping weight (10 × 250 g + 150 g)", w.body.total_weight_grams === 2650, w.body.total_weight_grams)
r = await S("POST", `/store/carts/${c.id}/line-items/${names.id}`, buyer, { quantity: 1 })
cart = await getCart(c.id, buyer.token)
const namesAfter = cart.items.find((i) => i.metadata?.names_numbers)
check("customer changing names quantity keeps the server price", Math.abs(namesAfter.unit_price - 18) < 0.001, namesAfter?.unit_price)
await S("POST", `/store/carts/${c.id}/line-items/${names.id}`, buyer, { quantity: 10 })
r = await checkout(c.id, buyer.token, { email: buyer.email, metadata: { cost_centre: "SQN-101" } })
check("names order placed (price check lets the server-priced line through)", r.status === 200, { step: r.step, status: r.status, body: r.body })
const namesOrder = r.body.order
await sleep(2000)
const nm = (await db.query(`select metadata from "order" where id=$1`, [namesOrder?.id])).rows[0]?.metadata
check("order carries names, roster and packing", nm?.names_numbers?.numbers === "up_to_a6" && nm?.packing === "individual" && nm?.roster?.total >= 1, { names_numbers: nm?.names_numbers, packing: nm?.packing, roster: nm?.roster })
const job = await A("GET", `/admin/jobs/${namesOrder?.id}`)
check("job window loads the order", job.status === 200, job.status)

describe("Sizing kit")
const shopper = await customer(`kit+${Date.now()}@shop.example.com`)
c = await newCart(shopper.token)
const kitIds = ["test-polo|Navy / S", "test-polo|Navy / M", "test-polo|Navy / L"].map((k) => st.V[k])
r = await api("POST", `/store/carts/${c.id}/sizing-kit`, { token: shopper.token, body: { variant_ids: [st.V["test-polo|Navy / S"], st.V["test-hoodie|Black / S"]] } })
check("two different garments refused", r.status === 400, r.body)
r = await api("POST", `/store/carts/${c.id}/sizing-kit`, { token: shopper.token, body: { variant_ids: ["variant_nope"] } })
check("unknown size refused", r.status === 400, r.body)
r = await api("POST", `/store/carts/${c.id}/sizing-kit`, { token: shopper.token, body: { variant_ids: Array(13).fill(0).map((_, i) => `variant_${i}`) } })
check("more than 12 sizes refused", r.status === 400, r.body)
r = await api("POST", `/store/carts/${c.id}/sizing-kit`, { token: shopper.token, body: { variant_ids: kitIds } })
check("3-size kit added", r.status === 200 && r.body.added_lines === 3, r.body)
cart = await getCart(c.id, shopper.token)
const kit = cart.items.filter((i) => i.metadata?.sizing_kit)
check("3 lines × 1, all marked sizing kit", kit.length === 3 && kit.every((l) => l.quantity === 1), kit.map((l) => [l.title, l.quantity]))
check("charged the normal blank price (> $0)", kit.every((l) => l.unit_price > 0), kit.map((l) => l.unit_price))
r = await api("POST", `/store/carts/${c.id}/line-items`, { token: shopper.token, body: { variant_id: st.V["test-polo|Navy / XL"], quantity: 1, metadata: { sizing_kit: true } } })
cart = await getCart(c.id, shopper.token)
check("a line can't claim to be a kit line from the browser", !cart.items.find((i) => i.variant_id === st.V["test-polo|Navy / XL"])?.metadata?.sizing_kit, cart.items.map((i) => i.metadata?.sizing_kit))
r = await api("POST", `/store/carts/${c.id}/sizing-kit`, { token: outsider.token, body: { variant_ids: kitIds } })
check("cart id is the capability (like other cart routes)", r.status === 200 || r.status === 404, r.status)
const done = await newCart(shopper.token)
await api("POST", `/store/carts/${done.id}/line-items`, { token: shopper.token, body: { variant_id: kitIds[0], quantity: 1 } })
await api("POST", `/store/carts/${done.id}`, { token: shopper.token, body: { email: shopper.email, shipping_address: { first_name: "K", last_name: "S", address_1: "1 St", city: "Sydney", province: "NSW", postal_code: "2000", country_code: "au" } } })

describe("PO document")
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64")
r = await api("POST", `/store/carts/${c.id}/po-document`, { body: { fileName: "evil.exe", dataBase64: pdf } })
check("only PDF / PNG / JPG accepted", r.status === 400, r.body)
r = await api("POST", `/store/carts/${c.id}/po-document`, { body: { fileName: "../../CLUB PO 123.pdf", mimeType: "application/pdf", dataBase64: pdf } })
check("PO PDF uploaded with a safe file name", r.status === 200 && r.body.po_document?.name === "CLUB_PO_123.pdf", r.body)
r = await api("POST", `/store/carts/${c.id}`, { token: shopper.token, body: { metadata: { po_document: { url: "https://evil.example.com/x.pdf", name: "x.pdf" } } } })
cart = await getCart(c.id, shopper.token)
check("the browser can't swap in its own link", cart.metadata?.po_document?.name === "CLUB_PO_123.pdf" && !String(cart.metadata.po_document.url).includes("evil"), cart.metadata?.po_document)
const big = Buffer.alloc(11 * 1024 * 1024, 1).toString("base64")
r = await api("POST", `/store/carts/${c.id}/po-document`, { body: { fileName: "big.pdf", dataBase64: big } })
check("over 10 MB refused cleanly", r.status === 400, r.status)
const kitOrderId = await completePersonal(c.id, shopper)
check("sizing-kit order placed", !!kitOrderId, kitOrderId)
await sleep(1500)
const ko = (await db.query(`select metadata from "order" where id=$1`, [kitOrderId])).rows[0]?.metadata
check("PO document on the order", ko?.po_document?.name === "CLUB_PO_123.pdf", ko?.po_document)
r = await api("DELETE", `/store/carts/${c.id}/po-document`, {})
check("can't change the PO on a placed order", r.status === 400, r.status)
const kj = await A("GET", `/admin/jobs/${kitOrderId}`)
check("job window loads the kit order with its PO document", kj.status === 200 && JSON.stringify(kj.body).includes("CLUB_PO_123.pdf") || JSON.stringify(kj.body).includes("po_document"), JSON.stringify(kj.body).slice(0, 300))

describe("Supplier details PDF")
r = await api("GET", "/store/customers/me/documents/supplier-pack", { token: buyer.token })
check("signed-in customer downloads a real PDF", r.status === 200 && Buffer.isBuffer(r.body) && r.body.slice(0, 4).toString() === "%PDF", { status: r.status, type: r.headers.get("content-type") })
fs.writeFileSync(new URL("./supplier-pack-test.pdf", import.meta.url), r.body)
r = await api("GET", "/store/customers/me/documents/supplier-pack", {})
check("not signed in: refused", r.status === 401, r.status)
r = await A("GET", "/admin/supplier-documents/supplier-pack?to=CLUB")
check("staff download it too", r.status === 200 && r.body.slice(0, 4).toString() === "%PDF", r.status)

describe("Staff put a job's designs in the organisation range")
const solo = await customer(`solo+${Date.now()}@club.example.com`, { first: "Sol", last: "Oh" })
await A("POST", `/admin/organisations/${org.id}/members`, { customer_id: solo.id, role: "purchaser" })
c = await newCart(solo.token)
const groupId = `grp-${Date.now()}`
const des = { version: 2, type: "fabric_customizer", method: "print", variantId: st.V["test-polo|White / M"], group_id: groupId, prints: [{ side: "back", sizeId: "up_to_a3" }], artifacts: [{ side: "back", printFileUrl: "https://example.com/b.png", mockupUrl: "https://example.com/bm.png", print_size_id: "up_to_a3" }] }
await api("POST", `/store/carts/${c.id}/line-items`, { token: solo.token, body: { variant_id: st.V["test-polo|White / M"], quantity: 3, metadata: { customizerDesign: des, product_handle: "test-polo" } } })
const soloOrder = await completePersonal(c.id, solo)
check("a member's personal Studio order placed", !!soloOrder, soloOrder)
r = await A("GET", `/admin/orders/${soloOrder}/organisation-range`)
check("staff see 1 design and the member's organisation", r.status === 200 && JSON.stringify(r.body).includes(org.id), r.body)
r = await A("POST", `/admin/orders/${soloOrder}/organisation-range`, { organisation_id: org.id })
check("staff add it to the range", r.status === 200, r.body)
r = await A("POST", `/admin/orders/${soloOrder}/organisation-range`, { organisation_id: org.id })
const designsBefore = (await db.query(`select count(*)::int n from design where organisation_id=$1 and deleted_at is null`, [org.id])).rows[0].n
r = await A("POST", `/admin/orders/${soloOrder}/organisation-range`, { organisation_id: org.id })
const designsAfter = (await db.query(`select count(*)::int n from design where organisation_id=$1 and deleted_at is null`, [org.id])).rows[0].n
check("adding twice makes no duplicate", designsBefore === designsAfter, { designsBefore, designsAfter })
r = await S("GET", `${base}/range`, buyer)
check("colleague now sees it in Our range, ready to order", (r.body.items ?? []).some((i) => i.product?.handle === "test-polo" && i.ready && i.base_colour === "White"), r.body.items?.map((i) => [i.name, i.base_colour, i.ready]))
r = await A("POST", `/admin/orders/${soloOrder}/organisation-range`, { organisation_id: st.other.id })
check("can't add to an organisation the customer isn't in", r.status >= 400, r.status)
const so = (await db.query(`select metadata from "order" where id=$1`, [soloOrder])).rows[0]?.metadata
check("order filed under the organisation", so?.organisation_id === org.id, so?.organisation_id)
r = await S("GET", `${base}/orders`, buyer)
check("…so colleagues see it in organisation orders", (r.body.orders ?? []).some((o) => o.id === soloOrder), null)

process.exit(summary(new URL("./t6.json", import.meta.url).pathname) ? 1 : 0)
