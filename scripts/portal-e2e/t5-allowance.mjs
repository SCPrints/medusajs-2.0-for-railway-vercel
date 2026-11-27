// Phase 5: uniform allowance (batch), gift links (home delivery), new-starter packs.
import fs from "fs"
import { api, check, checkout, db, describe, getCart, newCart, summary } from "./lib.mjs"

const st = JSON.parse(fs.readFileSync(new URL("./state.json", import.meta.url)))
const { org, owner, buyer, viewer, outsider, poloDesign, hoodieDesign } = st
const S = (m, p, who, body) => api(m, p, { token: who.token, body })
const P = (m, token, body) => api(m, `/store/allowance/${token}`, { body })
const base = `/store/customers/me/organisations/${org.id}`
const sleep = (ms) => new Promise((x) => setTimeout(x, ms))
const shipTotal = async (cartId, who) => {
  const r = await api("GET", `/store/cart-shipping-options?cart_id=${cartId}`, { token: who.token })
  return { amount: r.body.shipping_options?.[0]?.amount ?? r.body.shipping_options?.[0]?.calculated_price?.calculated_amount, weight: r.body.total_weight_grams, body: r.body }
}

// Fresh roster for this phase.
let r = await S("PUT", `${base}/roster`, buyer, { members: [
  { name: "Ann Able", unit: "HQ", sizes: { tops: "M" } },
  { name: "Ben Best", unit: "HQ", sizes: { tops: "L" } },
  { name: "Cat Cole", unit: "Field", sizes: { tops: "S" } },
] })
const roster = r.body.members
const id = (n) => roster.find((m) => m.name === n).id

describe("Batch allowance, delivered to us")
r = await S("POST", `${base}/allowances`, viewer, { name: "x", items: [{ design_id: poloDesign.id, per_person: 1 }] })
check("viewer cannot create an allowance", r.status >= 400, r.status)
r = await S("POST", `${base}/allowances`, buyer, { name: "2027 uniform", closes_on: "2030-12-31", items: [{ design_id: poloDesign.id, per_person: 2 }, { design_id: hoodieDesign.id, per_person: 1 }] })
check("purchaser creates an allowance for everyone", r.status === 201, r.body)
const al = r.body.id
r = await S("GET", `${base}/allowances/${al}`, buyer)
check("3 people, each with a private link", r.body.people?.length === 3 && r.body.people.every((p) => p.token?.length > 20), r.body.people)
check("one-off, delivered to us", r.body.allowance.kind === "batch" && r.body.allowance.delivery === "bulk", r.body.allowance)
const tok = Object.fromEntries(r.body.people.map((p) => [p.name, p.token]))
r = await P("GET", tok["Ann Able"])
check("person's link: no prices, their name, suggested size M", r.status === 200 && r.body.person.name === "Ann Able" && !JSON.stringify(r.body).match(/price|\$/) && r.body.items[0].suggested_size === "M", r.body)
r = await P("GET", "short")
check("a made-up link: 404", r.status === 404, r.status)
r = await P("POST", tok["Ann Able"], { picks: [{ design_id: poloDesign.id, size: "M", quantity: 3 }] })
check("more than the entitlement refused", r.status === 400, r.body)
r = await P("POST", tok["Ann Able"], { picks: [{ design_id: poloDesign.id, size: "XXXL", quantity: 1 }] })
check("a size the garment doesn't have refused", r.status === 400, r.body)
r = await P("POST", tok["Ann Able"], { picks: [{ design_id: st.order1?.id ?? "des_x", size: "M", quantity: 1 }] })
check("an item not on the allowance refused", r.status === 400, r.body)
r = await P("POST", tok["Ann Able"], { picks: [{ design_id: poloDesign.id, size: "M", quantity: 2 }, { design_id: hoodieDesign.id, size: "L", quantity: 1 }] })
check("Ann picks 2 polos M + hoodie L", r.status === 200, r.body)
r = await P("POST", tok["Ben Best"], { picks: [{ design_id: poloDesign.id, size: "L", quantity: 1 }, { design_id: poloDesign.id, size: "XL", quantity: 1 }] })
check("Ben picks 2 different polo sizes", r.status === 200, r.body)
const c1 = await newCart(buyer.token)
r = await S("POST", `${base}/allowances/${al}/add-to-cart`, buyer, { cart_id: c1.id })
check("adds everyone who chose; Cat left out", r.status === 200 && r.body.left_out.some((n) => n.startsWith("Cat Cole")) && r.body.added_lines >= 3, r.body)
r = await S("POST", `${base}/allowances/${al}/add-to-cart`, buyer, { cart_id: c1.id })
check("double click adds nothing", r.body.already_added === true && r.body.added_lines === 0, r.body)
let cart = await getCart(c1.id, buyer.token)
const qty = cart.items.filter((i) => i.metadata?.source_design_id).reduce((n, i) => n + i.quantity, 0)
check("cart holds exactly 5 garments", qty === 5, cart.items.map((i) => [i.title, i.quantity]))
// 28 Nov fix: names ride on each line (fleece names reach production).
const garmentLines = cart.items.filter((i) => i.metadata?.source_design_id)
check(
  "every garment line says who it's for",
  garmentLines.length > 0 && garmentLines.every((i) => Array.isArray(i.metadata?.allowance_people) && i.metadata.allowance_people.length > 0),
  garmentLines.map((i) => [i.variant_title ?? i.title, i.metadata?.allowance_people])
)
const annPolo = garmentLines.find((i) => i.metadata?.source_design_id === poloDesign.id && i.quantity === 2)
check(
  "Ann's 2 polos M line names Ann ×2 only",
  JSON.stringify(annPolo?.metadata?.allowance_people) === JSON.stringify([{ name: "Ann Able", quantity: 2 }]),
  annPolo?.metadata?.allowance_people
)
check("cart remembers the roster", Array.isArray(cart.metadata?.roster?.member_ids ?? cart.metadata?.roster?.ids ?? cart.metadata?.roster?.people) || cart.metadata?.roster?.total === 2, cart.metadata?.roster)
r = await P("GET", tok["Cat Cole"])
check("links close once it's in a cart (read-only)", r.status === 200 && r.body.closed === true, r.status)
r = await P("POST", tok["Cat Cole"], { picks: [] })
check("a closed link refuses changes", r.status === 409, r.status)
const sh = await shipTotal(c1.id, buyer)
check("normal shipping charged (delivered to us)", sh.amount > 0, sh)

describe("Gift links: posted to each person's home")
r = await S("POST", `${base}/allowances`, owner, { name: "Christmas hoodie", items: [{ design_id: hoodieDesign.id, per_person: 1 }], delivery: "home" })
const gift = r.body.id
r = await S("GET", `${base}/allowances/${gift}`, owner)
const gt = Object.fromEntries(r.body.people.map((p) => [p.name, p.token]))
r = await P("GET", gt["Ann Able"])
check("link asks for an address (delivery: home)", r.body.allowance.delivery === "home" && r.body.address === null, r.body.allowance)
r = await P("POST", gt["Ann Able"], { picks: [{ design_id: hoodieDesign.id, size: "M", quantity: 1 }] })
check("no address: refused", r.status === 400, r.body)
r = await P("POST", gt["Ann Able"], { picks: [{ design_id: hoodieDesign.id, size: "M", quantity: 1 }], address: { name: "Ann Able", address_1: "5 Pitt St", city: "Sydney", province: "NSW", postal_code: "20" } })
check("bad postcode: refused", r.status === 400 && /postcode/.test(r.body.error), r.body)
r = await P("POST", gt["Ann Able"], { picks: [{ design_id: hoodieDesign.id, size: "M", quantity: 1 }], address: { name: "Ann Able", address_1: "5 Pitt St", city: "Sydney", province: "nsw", postal_code: "2000", phone: "0400111222" } })
check("Ann gives her Sydney address", r.status === 200, r.body)
r = await P("GET", gt["Ann Able"])
check("her saved address comes back to her only", r.body.address?.postal_code === "2000" && r.body.address.province === "NSW", r.body.address)
r = await P("POST", gt["Ben Best"], { picks: [{ design_id: hoodieDesign.id, size: "XL", quantity: 1 }], address: { name: "Ben Best", company: "Base", address_1: "1 Smith St", city: "Darwin", province: "NT", postal_code: "0800" } })
check("Ben gives a Darwin address", r.status === 200, r.body)
r = await P("POST", gt["Cat Cole"], { picks: [{ design_id: hoodieDesign.id, size: "S", quantity: 1 }] })
check("Cat picks but gives no address → refused, so she can't be shipped half-done", r.status === 400, r.body)
r = await S("GET", `${base}/allowances/${gift}`, owner)
check("owner sees who gave an address", r.body.people.find((p) => p.name === "Ann Able").address?.city === "Sydney", r.body.people.map((p) => [p.name, p.address?.city]))
const c2 = await newCart(owner.token)
r = await S("POST", `${base}/allowances/${gift}/add-to-cart`, owner, { cart_id: c2.id })
check("added: Ann + Ben, postage worked out", r.status === 200 && r.body.postage > 0 && r.body.left_out.some((n) => n.startsWith("Cat Cole")), r.body)
const postage = r.body.postage
cart = await getCart(c2.id, owner.token)
const postLine = cart.items.find((i) => i.metadata?.home_delivery_postage)
check("one postage line 'Delivery to 2 addresses'", postLine?.title === "Delivery to 2 addresses" && Math.abs(postLine.unit_price - postage) < 0.01, postLine)
check("every line is marked home delivery", cart.items.every((i) => i.metadata?.home_delivery === true), cart.items.map((i) => [i.title, i.metadata?.home_delivery]))
check("addresses on the cart for staff", cart.metadata?.home_delivery?.length === 2, cart.metadata?.home_delivery)
const sh2 = await shipTotal(c2.id, owner)
check("cart's own shipping is $0", sh2.amount === 0, sh2)
r = await S("POST", `/store/carts/${c2.id}`, owner, { metadata: { home_delivery: [{ name: "Forged" }] } })
cart = await getCart(c2.id, owner.token)
check("customer cannot overwrite the addresses", cart.metadata?.home_delivery?.length === 2 && cart.metadata.home_delivery[0].name !== "Forged", cart.metadata?.home_delivery)
r = await S("POST", `/store/carts/${c2.id}/line-items`, owner, { variant_id: st.V["test-polo|Navy / S"], quantity: 1, metadata: { home_delivery: true } })
cart = await getCart(c2.id, owner.token)
const forged = cart.items.find((i) => i.variant_id === st.V["test-polo|Navy / S"])
check("a line forged as 'home delivery' is stripped of the flag", forged && forged.metadata?.home_delivery !== true, forged?.metadata)
const sh3 = await shipTotal(c2.id, owner)
check("…so that extra polo is charged normal shipping", sh3.amount > 0, sh3)
await S("DELETE", `/store/carts/${c2.id}/line-items/${forged.id}`, owner)
// Removing the postage line must not give free delivery.
await S("DELETE", `/store/carts/${c2.id}/line-items/${postLine.id}`, owner)
r = await checkout(c2.id, owner.token, { email: owner.email, metadata: { cost_centre: "SQN-101" } })
check("postage line removed: checkout refused", r.status === 409 && r.body?.code === "home_delivery_postage_missing", { step: r.step, status: r.status, body: r.body })
// Put the postage back the way staff would (re-run the postage step for this cart).
await db.query(`update cart_line_item set deleted_at = null where id = $1`, [postLine.id])
r = await checkout(c2.id, owner.token, { email: owner.email, metadata: { cost_centre: "SQN-101" } })
check("gift order placed", r.status === 200, { step: r.step, status: r.status, body: r.body })
await sleep(1500)
const go = (await db.query(`select metadata from "order" where id=$1`, [r.body.order?.id])).rows[0]?.metadata
check("order holds both parcels with addresses and items", go?.home_delivery?.length === 2 && go.home_delivery.every((p) => p.address?.postal_code && p.items?.length && p.postage > 0), go?.home_delivery)
const goTotal = Number((await db.query(`select totals->>'current_order_total' t, totals->>'shipping_total' s from order_summary where order_id=$1`, [r.body.order?.id])).rows[0]?.t)
check("order total includes the postage line", goTotal > postage, { goTotal, postage })

describe("New-starter pack")
r = await S("POST", `${base}/allowances`, owner, { name: "New starter kit", items: [{ design_id: poloDesign.id, per_person: 3 }], kind: "ongoing", delivery: "home" })
check("new-starter pack created with nobody on it yet", r.status === 201, r.body)
const pack = r.body.id
r = await S("GET", `${base}/allowances/${pack}`, owner)
check("starts empty; everyone on the roster can be added", r.body.people.length === 0 && r.body.can_add.length === 3, { people: r.body.people.length, can_add: r.body.can_add.length })
r = await S("POST", `${base}/allowances/${pack}/people`, viewer, { roster_member_id: id("Cat Cole") })
check("viewer cannot add a person", r.status >= 400, r.status)
r = await S("POST", `${base}/allowances/${pack}/people`, owner, { roster_member_id: "orgrm_fake" })
check("someone not on the roster: 404", r.status === 404, r.status)
r = await S("POST", `/store/customers/me/organisations/${st.other.id}/allowances/${pack}/people`, outsider, { roster_member_id: id("Cat Cole") })
check("another organisation can't touch the pack", r.status === 404, r.status)
r = await S("POST", `${base}/allowances/${pack}/people`, owner, { roster_member_id: id("Cat Cole") })
check("owner gives Cat her link", r.status === 201 && r.body.token, r.body)
const catTok = r.body.token
r = await S("POST", `${base}/allowances/${pack}/people`, owner, { roster_member_id: id("Cat Cole") })
check("adding her again returns the same link", r.status === 200 && r.body.token === catTok, r.body)
r = await P("POST", catTok, { picks: [{ design_id: poloDesign.id, size: "S", quantity: 3 }], address: { name: "Cat Cole", address_1: "9 Main Rd", city: "Dubbo", province: "NSW", postal_code: "2830" } })
check("Cat picks 3 polos and gives her Dubbo address", r.status === 200, r.body)
const c3 = await newCart(owner.token)
r = await S("POST", `${base}/allowances/${pack}/add-to-cart`, owner, { cart_id: c3.id })
check("must say whose pack", r.status === 400, r.body)
r = await S("POST", `${base}/allowances/${pack}/add-to-cart`, owner, { cart_id: c3.id, roster_member_id: id("Cat Cole") })
check("Cat's pack added, postage for 1 address", r.status === 200 && r.body.postage > 0, r.body)
r = await S("POST", `${base}/allowances/${pack}/add-to-cart`, owner, { cart_id: c3.id, roster_member_id: id("Cat Cole") })
check("her pack can't be added twice", r.body.already_added === true, r.body)
r = await P("GET", catTok)
check("her link closes once ordered (read-only)", r.status === 200 && r.body.closed === true, r.status)
r = await P("POST", catTok, { picks: [] })
check("her closed link refuses changes", r.status === 409, r.status)
r = await S("GET", `${base}/allowances/${pack}`, owner)
check("pack stays open; Cat shows Ordered", r.body.allowance.closed === false && r.body.people.find((p) => p.name === "Cat Cole")?.ordered === true, r.body)
r = await S("POST", `${base}/allowances/${pack}/people`, owner, { roster_member_id: id("Ann Able") })
check("next new starter can still be added", r.status === 201, r.body)
r = await S("POST", `${base}/allowances/${pack}`, owner, { closed: true })
r = await S("POST", `${base}/allowances/${pack}/people`, owner, { roster_member_id: id("Ben Best") })
check("closed pack takes nobody new", r.status === 400, r.status)
cart = await getCart(c3.id, owner.token)
check("pack cart: 3 polos + 1 postage line, shipping $0", cart.items.filter((i) => i.metadata?.source_design_id).reduce((n, i) => n + i.quantity, 0) === 3 && (await shipTotal(c3.id, owner)).amount === 0, cart.items.map((i) => [i.title, i.quantity]))

fs.writeFileSync(new URL("./state.json", import.meta.url), JSON.stringify(st, null, 1))
process.exit(summary(new URL("./t5.json", import.meta.url).pathname) ? 1 : 0)
