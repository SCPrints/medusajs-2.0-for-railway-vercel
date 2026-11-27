// Tiny E2E harness against the throwaway backend on :9000.
import pg from "pg"
import fs from "fs"

export const B = "http://localhost:9000"
export const db = new pg.Client("postgres://medusa:medusa@localhost:54329/medusa_test")
await db.connect()
export const PK = (await db.query("select token from api_key where type='publishable' limit 1")).rows[0].token

const results = []
let section = ""
export const describe = (name) => {
  section = name
  console.log(`\n## ${name}`)
}
export function check(name, cond, detail) {
  results.push({ section, name, ok: !!cond, detail })
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}` : ""}`)
  return !!cond
}
export function summary(file) {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  for (const f of failed) console.log(`  FAIL [${f.section}] ${f.name}`)
  if (file) fs.writeFileSync(file, JSON.stringify(results, null, 1))
  return failed.length
}

/** fetch → { status, body } ; never throws on HTTP status. */
export async function api(method, path, { token, body, store = path.startsWith("/store"), raw, headers = {} } = {}) {
  const h = { ...headers }
  if (body !== undefined && !raw) h["content-type"] = "application/json"
  if (store) h["x-publishable-api-key"] = PK
  if (token) h.authorization = `Bearer ${token}`
  const res = await fetch(B + path, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) })
  const type = res.headers.get("content-type") ?? ""
  let out
  if (type.includes("json")) out = await res.json().catch(() => null)
  else if (type.includes("pdf") || type.includes("octet")) out = Buffer.from(await res.arrayBuffer())
  else out = await res.text()
  return { status: res.status, body: out, headers: res.headers }
}

export async function adminToken() {
  const r = await api("POST", "/auth/user/emailpass", { body: { email: "staff@e2e.test", password: "e2e-staff-pass" }, store: false })
  return r.body.token
}

/** Register (or log in) a customer; marks the email confirmed unless `unconfirmed`. */
export async function customer(email, { first = "Test", last = "Person", company = null, unconfirmed = false } = {}) {
  const pass = "e2e-pass-123"
  let r = await api("POST", "/auth/customer/emailpass/register", { body: { email, password: pass }, store: false })
  if (r.status === 200) {
    const reg = r.body.token
    const c = await api("POST", "/store/customers", { token: reg, body: { email, first_name: first, last_name: last, company_name: company ?? undefined } })
    if (c.status !== 200) throw new Error(`create customer ${email}: ${c.status} ${JSON.stringify(c.body)}`)
  }
  r = await api("POST", "/auth/customer/emailpass", { body: { email, password: pass }, store: false })
  const token = r.body.token
  const me = await api("GET", "/store/customers/me", { token })
  const id = me.body.customer.id
  if (!unconfirmed) {
    await db.query(`update customer set metadata = coalesce(metadata,'{}'::jsonb) - 'email_verification_required' where id = $1`, [id])
  }
  return { id, email, token }
}

export const REGION = async () => (await db.query("select id from region limit 1")).rows[0].id

export async function newCart(token, extra = {}) {
  const r = await api("POST", "/store/carts", { token, body: { region_id: await REGION(), ...extra } })
  if (r.status !== 200) throw new Error(`cart: ${r.status} ${JSON.stringify(r.body)}`)
  return r.body.cart
}

export async function getCart(id, token) {
  return (await api("GET", `/store/carts/${id}?fields=*items,+items.metadata,+metadata,*shipping_methods`, { token })).body.cart
}

export const ADDRESS = {
  first_name: "Test", last_name: "Buyer", address_1: "1 George St", city: "Sydney", province: "NSW", postal_code: "2000", country_code: "au", phone: "0400000000",
}

/** Address → shipping → payment (system provider) → complete. Returns { status, body }. */
export async function checkout(cartId, token, { email = "buyer@shop.example.com", metadata } = {}) {
  let r = await api("POST", `/store/carts/${cartId}`, { token, body: { email, shipping_address: ADDRESS, billing_address: ADDRESS, ...(metadata ? { metadata } : {}) } })
  if (r.status !== 200) return { step: "address", ...r }
  const opts = await api("GET", `/store/shipping-options?cart_id=${cartId}`, { token })
  const so = opts.body?.shipping_options?.[0]
  if (!so) return { step: "shipping-options", ...opts }
  r = await api("POST", `/store/carts/${cartId}/shipping-methods`, { token, body: { option_id: so.id } })
  if (r.status !== 200) return { step: "shipping-method", ...r }
  const pc = await api("POST", "/store/payment-collections", { token, body: { cart_id: cartId } })
  if (pc.status !== 200) return { step: "payment-collection", ...pc }
  r = await api("POST", `/store/payment-collections/${pc.body.payment_collection.id}/payment-sessions`, { token, body: { provider_id: "pp_system_default" } })
  if (r.status !== 200) return { step: "payment-session", ...r }
  r = await api("POST", `/store/carts/${cartId}/complete`, { token })
  return { step: "complete", ...r }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
