// Phase 7: team stores end to end (TEAM_STORES_ENABLED=true in this throwaway copy only).
import fs from "fs"
import { execSync } from "child_process"
import { ADDRESS, api, adminToken, check, customer, db, describe, getCart, newCart, summary } from "./lib.mjs"

const st = JSON.parse(fs.readFileSync(new URL("./state.json", import.meta.url)))
const { org, d1 } = st
const admin = await adminToken()
const A = (m, p, body) => api(m, p, { token: admin, body, store: false })
const sleep = (ms) => new Promise((x) => setTimeout(x, ms))
const ENV = new URL("./env.sh", import.meta.url).pathname
async function completePersonal(cartId, who) {
  await api("POST", `/store/carts/${cartId}`, { token: who.token, body: { email: who.email, shipping_address: ADDRESS, billing_address: ADDRESS } })
  const so = (await api("GET", `/store/shipping-options?cart_id=${cartId}`, { token: who.token })).body?.shipping_options?.[0]
  await api("POST", `/store/carts/${cartId}/shipping-methods`, { token: who.token, body: { option_id: so?.id } })
  try {
    const out = execSync(`MEDUSA_DISABLE_ADMIN=true CART_ID=${cartId} ${ENV} npx medusa exec src/scripts/zz-e2e-complete.ts 2>&1`, { encoding: "utf8" })
    await sleep(4000)
    for (let i = 0; i < 60 && !(await fetch("http://localhost:9000/health").then((x) => x.ok).catch(() => false)); i++) await sleep(1000)
    await sleep(2000)
    return out.match(/E2E_ORDER=(\S+)/)?.[1] ?? null
  } catch (e) {
    console.log(String(e.stdout ?? e).split("\n").filter((l) => /rror/.test(l)).slice(0, 3).join("\n"))
    return null
  }
}
const design = { version: 2, type: "fabric_customizer", method: "print", variantId: st.V["test-polo|Navy / M"], prints: [{ side: "front", sizeId: "up_to_a4" }], artifacts: [{ side: "front", printFileUrl: "https://example.com/ts.png", mockupUrl: "https://example.com/tsm.png", print_size_id: "up_to_a4" }] }
const handle = `cadets-${Date.now().toString(36)}`

describe("Staff set up the store")
let r = await A("POST", "/admin/team-stores", { organisation_id: org.id, title: "Cadet Unit Store", handle, closes_at: new Date(Date.now() + 7 * 86400000).toISOString(), delivery_mode: "bulk", delivery_destination_id: d1.id, expected_quantity: 40, minimum_quantity: 2, fundraising_per_item: 5 })
check("store created with $5 fundraising per item", r.status < 300, r.body)
const store = r.body.store ?? r.body
const sid = store.id
check("fundraising saved on the store", (await db.query(`select metadata from team_store where id=$1`, [sid])).rows[0]?.metadata?.fundraising_per_item === 5)
r = await A("POST", "/admin/team-stores", { organisation_id: org.id, title: "Bad", closes_at: new Date(Date.now() + 86400000).toISOString(), delivery_mode: "bulk", fundraising_per_item: 500 })
check("fundraising over $100 refused", r.status === 400, r.status)
r = await A("POST", `/admin/team-stores/${sid}/items`, { product_handle: "test-polo", colour: "Navy", allowed_sizes: ["S", "M", "L"], customizer_design: design, print_size_ids: { front: "up_to_a4" }, unit_price: 35 })
check("staff add the Navy polo at $35", r.status < 300, r.body)
const item = r.body.item ?? r.body
const itemId = item.id ?? (await db.query(`select id from team_store_item where team_store_id=$1`, [sid])).rows[0]?.id
r = await api("GET", `/store/team-stores/${handle}`, {})
check("buyers can't see it before it opens", r.status === 404, r.status)
r = await A("POST", `/admin/team-stores/${sid}/open`)
check("can't open before the organiser approves", r.status >= 400 && r.status < 500, r.status)

describe("Organiser approval")
r = await A("POST", `/admin/team-stores/${sid}/send-approval`, { email: "organiser@club.example.com", send_email: false })
check("approval link made", r.status === 200 && /approve\?sig=/.test(r.body.approval_url), r.body)
const sig = new URL(r.body.approval_url).searchParams.get("sig")
r = await api("GET", `/store/team-stores/${handle}/approve?sig=${sig}`, {})
check("organiser sees items with the buyer price $40 (35 + 5)", r.status === 200 && r.body.items?.[0]?.unit_price === 40 && r.body.store.fundraising_per_item === 5, r.body.items?.[0])
r = await api("POST", `/store/team-stores/${handle}/approve`, { body: { sig: "wrongsignature123", name: "Nope" } })
check("a forged signature can't approve", r.status === 404 || r.status === 403, r.status)
r = await api("POST", `/store/team-stores/${handle}/approve`, { body: { sig, name: "Sam Organiser" } })
check("organiser approves by name", r.status === 200 && r.body.approved, r.body)
r = await A("POST", `/admin/team-stores/${sid}/open`)
check("staff open it", r.status === 200, r.body)

describe("Buyers")
r = await api("GET", `/store/team-stores/${handle}`, {})
check("store page shows $40 and the fundraising note", r.status === 200 && r.body.items?.[0]?.unit_price === 40 && r.body.store.fundraising_per_item === 5, r.body.store)
check("only the allowed sizes S/M/L", JSON.stringify(r.body.items?.[0]?.sizes?.map((s) => s.size)) === JSON.stringify(["S", "M", "L"]), r.body.items?.[0]?.sizes)
check("no print files, no cost on the public page", !JSON.stringify(r.body).includes("ts.png") && !JSON.stringify(r.body).includes("unit_cost"), null)
const parent = await customer(`parent+${Date.now()}@family.example.com`, { first: "Pam", last: "Parent" })
let c = await newCart(parent.token)
r = await api("POST", `/store/carts/${c.id}/team-store-items`, { token: parent.token, body: { team_store_id: sid, lines: [{ item_id: itemId, variant_id: st.V["test-polo|Navy / XL"], quantity: 1 }] } })
check("a size the store doesn't sell is refused", r.status >= 400, r.status)
r = await api("POST", `/store/carts/${c.id}/team-store-items`, { token: parent.token, body: { team_store_id: sid, lines: [{ item_id: itemId, variant_id: st.V["test-polo|Navy / M"], quantity: 2 }] } })
check("parent adds 2 polos", r.status === 200, r.body)
let cart = await getCart(c.id, parent.token)
const tl = cart.items.find((i) => i.metadata?.team_store_id === sid)
check("charged $40 each, $5 of it fundraising", tl?.unit_price === 40 && tl.metadata.team_store_fundraising === 5 && tl.metadata.team_store_locked_price === true, tl && { p: tl.unit_price, m: tl.metadata })
r = await api("POST", `/store/carts/${c.id}/line-items`, { token: parent.token, body: { variant_id: st.V["test-polo|Navy / S"], quantity: 1 } })
check("can't mix normal shop items into a team-store cart", r.status >= 400, r.status)
const normal = await newCart(parent.token)
await api("POST", `/store/carts/${normal.id}/line-items`, { token: parent.token, body: { variant_id: st.V["test-polo|Navy / S"], quantity: 1 } })
r = await api("POST", `/store/carts/${normal.id}/team-store-items`, { token: parent.token, body: { team_store_id: sid, lines: [{ item_id: itemId, variant_id: st.V["test-polo|Navy / M"], quantity: 1 }] } })
check("can't add a team-store item to a normal cart", r.status >= 400, r.status)
const ship = await api("GET", `/store/cart-shipping-options?cart_id=${c.id}`, { token: parent.token })
check("bulk delivery to the unit: $0 shipping", (ship.body.shipping_options?.[0]?.amount ?? -1) === 0, ship.body.shipping_options?.[0]?.amount)
await api("POST", `/store/carts/${c.id}/line-items/${tl.id}`, { token: parent.token, body: { quantity: 3 } })
cart = await getCart(c.id, parent.token)
check("price stays $40 when the quantity changes", cart.items.find((i) => i.id === tl.id)?.unit_price === 40, cart.items.map((i) => i.unit_price))
const o1 = await completePersonal(c.id, parent)
check("parent's order placed", !!o1, o1)
const om = (await db.query(`select metadata from "order" where id=$1`, [o1])).rows[0]?.metadata
const addr = (await db.query(`select a.address_1, a.city from "order" o join order_address a on a.id=o.shipping_address_id where o.id=$1`, [o1])).rows[0]
check("order is tagged to the store", om?.team_store_id === sid, om)
check("delivery address swapped to the unit's address", addr?.address_1 === "Percival Rd", addr)
const parent2 = await customer(`parent2+${Date.now()}@family.example.com`, { first: "Paul", last: "Two" })
c = await newCart(parent2.token)
await api("POST", `/store/carts/${c.id}/team-store-items`, { token: parent2.token, body: { team_store_id: sid, lines: [{ item_id: itemId, variant_id: st.V["test-polo|Navy / S"], quantity: 1 }, { item_id: itemId, variant_id: st.V["test-polo|Navy / L"], quantity: 2 }] } })
const o2 = await completePersonal(c.id, parent2)
check("second parent's order placed", !!o2, o2)

describe("Password-protected store")
await A("POST", `/admin/team-stores/${sid}`, { password: "wings2027" })
r = await api("GET", `/store/team-stores/${handle}`, {})
check("without the password: asks for it", r.status === 401 && r.body.password_required, r.body)
r = await api("GET", `/store/team-stores/${handle}`, { headers: { "x-team-store-password": "wrong" } })
check("wrong password refused", r.status === 401 && r.body.wrong, r.body)
r = await api("GET", `/store/team-stores/${handle}`, { headers: { "x-team-store-password": "wings2027" } })
check("right password opens it", r.status === 200, r.status)
c = await newCart(parent2.token)
r = await api("POST", `/store/carts/${c.id}/team-store-items`, { token: parent2.token, body: { team_store_id: sid, lines: [{ item_id: itemId, variant_id: st.V["test-polo|Navy / S"], quantity: 1 }] } })
check("can't add to cart without the password", r.status >= 400, r.status)
await A("POST", `/admin/team-stores/${sid}`, { password: "" })

describe("Close and the production run")
r = await A("POST", `/admin/team-stores/${sid}/close`)
check("staff close the store", r.status === 200, r.body)
const run = r.body.run
check("run: 2 orders, 6 polos", run?.orders === 2 && run?.units === 6, run)
check("run revenue $240 (6 × $40)", run?.revenue === 240, run?.revenue)
check("raised for the unit: $30 (6 × $5)", run?.fundraising === 30, run?.fundraising)
check("size totals S1 M3 L2", JSON.stringify(run?.items?.[0]?.sizes) === JSON.stringify([{ size: "S", quantity: 1 }, { size: "M", quantity: 3 }, { size: "L", quantity: 2 }]), run?.items?.[0]?.sizes)
const sRow = (await db.query(`select status, quote_id from team_store where id=$1`, [sid])).rows[0]
check("store closed with a production-run job", sRow.status === "closed" && !!sRow.quote_id, sRow)
const q = (await db.query(`select status, metadata, message from quote where id=$1`, [sRow.quote_id])).rows[0]
check("run job is accepted, from the team store, mentions the $30 to pay back", q?.status === "accepted" && /30\.00/.test(q?.message ?? ""), q)
c = await newCart(parent2.token)
r = await api("POST", `/store/carts/${c.id}/team-store-items`, { token: parent2.token, body: { team_store_id: sid, lines: [{ item_id: itemId, variant_id: st.V["test-polo|Navy / S"], quantity: 1 }] } })
check("closed store takes no more orders", r.status >= 400, r.status)
r = await A("POST", `/admin/team-stores/${sid}/start-run`)
check("staff start the run", r.status === 200, r.body)
await sleep(2500)
const stages = (await db.query(`select metadata->>'artwork_stage' a from "order" where id = any($1)`, [[o1, o2]])).rows.map((x) => x.a)
check("every buyer order's artwork marked approved", stages.every((s) => s === "approved"), stages)
r = await A("GET", "/admin/jobs?folder=all")
check("buyer orders are hidden from the Jobs list (the run is the job)", !JSON.stringify(r.body).includes(o1), null)

process.exit(summary(new URL("./t7.json", import.meta.url).pathname) ? 1 : 0)
