// Fix 1 (27 Nov): a member staff added before they had a login keeps the organisation once they sign up and confirm.
import { createHmac } from "crypto"
import { api, adminToken, check, customer, db, describe, summary } from "./lib.mjs"

const admin = await adminToken()
const RUN = Date.now().toString(36)
const A = (m, p, body) => api(m, p, { token: admin, body, store: false })
const SECRET = "nps-dev-secret-do-not-use-in-prod"
const verifyLink = (email) => {
  const e = email.toLowerCase()
  const exp = Math.floor(Date.now() / 1000) + 3600
  return { email: e, exp, sig: createHmac("sha256", SECRET).update(`email-verify:${e}:${exp}`).digest("hex").slice(0, 32) }
}
const members = async (orgId) =>
  (await db.query("select customer_id, role from organisation_member where organisation_id=$1 and deleted_at is null order by created_at", [orgId])).rows
const tiers = async (cid) =>
  (await db.query(`select g.name from customer_group g join customer_group_customer x on x.customer_group_id=g.id where x.customer_id=$1 and x.deleted_at is null and g.deleted_at is null`, [cid])).rows.map((x) => x.name)

describe("Guest member signs up later")
const G = `guest+${RUN}@agency.example.com`
let r = await A("POST", "/admin/customers", { email: G, first_name: "Alex", last_name: "Sample", company_name: "HQ Club (test)" })
check("staff create a guest customer", r.status < 300, r.body)
const guestId = r.body.customer?.id
r = await A("POST", "/admin/organisations", { handle: `club-claim-${RUN}`, name: "HQ Club claim test", default_pricing_tier: "silver" })
const org = r.body.organisation ?? r.body
check("organisation created with Silver tier", !!org?.id, r.body)
r = await A("POST", `/admin/organisations/${org.id}/members`, { customer_id: guestId, role: "owner" })
check("guest record added as owner", r.status < 300 && r.body.member?.customer_id === guestId, r.body)

const acct = await customer(G, { first: "Al", last: "Sample", unconfirmed: true })
check("sign-up made a separate account record", !!acct.id && acct.id !== guestId, acct.id)
r = await api("GET", "/store/customers/me/organisations", { token: acct.token })
check("before confirming: no organisation", !JSON.stringify(r.body).includes(org.id), r.body)

r = await api("POST", "/store/customers/verify-email", { body: verifyLink(G) })
check("confirm link accepted", r.status === 200, r.body)
r = await api("GET", "/store/customers/me/organisations", { token: acct.token })
check("after confirming: the organisation is listed", JSON.stringify(r.body).includes(org.id), r.body)
let mem = await members(org.id)
check("one membership, moved to the account, still owner", mem.length === 1 && mem[0].customer_id === acct.id && mem[0].role === "owner", mem)
check("account got the organisation's Silver tier", (await tiers(acct.id)).includes("Tier: Silver"), await tiers(acct.id))
check("guest record no longer holds the tier", !(await tiers(guestId)).includes("Tier: Silver"), await tiers(guestId))
r = await api("POST", "/store/customers/verify-email", { body: verifyLink(G) })
mem = await members(org.id)
check("confirming again changes nothing", r.status === 200 && mem.length === 1 && mem[0].customer_id === acct.id, mem)

describe("Staff pick the guest record after the person has a confirmed login")
const H = `warrant+${RUN}@agency.example.com`
const acctH = await customer(H, { first: "Rob", last: "Maitland" })
r = await A("POST", "/admin/customers", { email: H, first_name: "Robert", last_name: "Maitland" })
const guestH = r.body.customer?.id
check("guest record for the same email created", !!guestH && guestH !== acctH.id, r.body)
r = await A("POST", `/admin/organisations/${org.id}/members`, { customer_id: guestH, role: "purchaser" })
check("membership goes to the confirmed login", r.status < 300 && r.body.member?.customer_id === acctH.id, r.body)
r = await api("GET", "/store/customers/me/organisations", { token: acctH.token })
check("that login sees the organisation", JSON.stringify(r.body).includes(org.id), r.body)

describe("An unconfirmed login is never used")
const U = `unconf+${RUN}@agency.example.com`
await customer(U, { unconfirmed: true })
r = await A("POST", "/admin/customers", { email: U, first_name: "Una" })
const guestU = r.body.customer?.id
r = await A("POST", `/admin/organisations/${org.id}/members`, { customer_id: guestU, role: "viewer" })
check("membership stays on the guest record", r.status < 300 && r.body.member?.customer_id === guestU, r.body)

process.exit(summary("t9.json") ? 1 : 0)
