// Phase 1: organisations, members, roles, invites, tiers, privacy between organisations.
import fs from "fs"
import { createHash, randomBytes } from "crypto"
import { api, adminToken, check, customer, db, describe, summary } from "./lib.mjs"

const admin = await adminToken()
const RUN = Date.now().toString(36)
const em = (local, dom) => `${local}+${RUN}@${dom}`
const A = (m, p, body) => api(m, p, { token: admin, body, store: false })

describe("Fixture")
const owner = await customer(em("owner","club.example.com"), { first: "Olive", last: "Owner", company: "CLUB" })
const buyer = await customer(em("buyer","club.example.com"), { first: "Pat", last: "Purchaser" })
const viewer = await customer(em("viewer","club.example.com"), { first: "Vic", last: "Viewer" })
const outsider = await customer(em("outsider","other.example.com"), { first: "Out", last: "Sider" })
const invitee = await customer(em("newstaff","club.example.com"), { first: "Nina", last: "New" })
const unverified = await customer(em("unverified","club.example.com"), { first: "Una", last: "Unverified", unconfirmed: true })
check("six customers created", [owner, buyer, viewer, outsider, invitee, unverified].every((c) => c.id))

let r = await A("POST", "/admin/organisations", { handle: `club-${RUN}`, name: "Northside Cadets (test)", contact_email: em("owner","club.example.com"), default_pricing_tier: "silver" })
check("staff create organisation with Silver tier", r.status === 200 || r.status === 201, r.body)
const org = r.body.organisation ?? r.body
r = await A("POST", "/admin/organisations", { handle: `other-${RUN}`, name: "Other Org (test)" })
const other = r.body.organisation ?? r.body
check("second organisation created", !!other?.id, r.body)

for (const [c, role] of [[owner, "owner"], [buyer, "purchaser"], [viewer, "viewer"]]) {
  r = await A("POST", `/admin/organisations/${org.id}/members`, { customer_id: c.id, role })
  check(`staff add ${role}`, r.status < 300, r.body)
}
r = await A("POST", `/admin/organisations/${other.id}/members`, { customer_id: outsider.id, role: "owner" })
check("outsider owns the other organisation", r.status < 300, r.body)

describe("Organisation pricing tier")
const tierOf = async (cid) =>
  (await db.query(`select g.name from customer_group g join customer_group_customer x on x.customer_group_id=g.id where x.customer_id=$1 and x.deleted_at is null and g.deleted_at is null`, [cid])).rows.map((x) => x.name)
for (const [c, n] of [[owner, "owner"], [buyer, "purchaser"], [viewer, "viewer"]]) {
  check(`${n} put in "Tier: Silver"`, (await tierOf(c.id)).includes("Tier: Silver"), await tierOf(c.id))
}
check("outsider NOT in Silver", !(await tierOf(outsider.id)).includes("Tier: Silver"), await tierOf(outsider.id))
r = await A("POST", "/admin/organisations", { handle: `bad-${RUN}`, name: "Bad tier", default_pricing_tier: "diamond-plus" })
check("unknown tier refused on create", r.status === 400, r.status)

describe("Membership and roles")
r = await api("GET", "/store/customers/me/organisations", { token: owner.token })
check("owner sees the organisation in their list", JSON.stringify(r.body).includes(org.id), r.body)
r = await api("GET", "/store/customers/me/organisations", { token: outsider.token })
check("outsider does not see CLUB", !JSON.stringify(r.body).includes(org.id))
r = await api("GET", `/store/customers/me/organisations/${org.id}`, { token: viewer.token })
check("viewer can open the organisation", r.status === 200 && JSON.stringify(r.body).includes("viewer"), r.body)
r = await api("GET", `/store/customers/me/organisations/${org.id}`, { token: outsider.token })
check("outsider gets 404 on CLUB", r.status === 404, r.status)
r = await api("GET", `/store/customers/me/organisations/${org.id}/members`, { token: buyer.token })
const members = r.body.members ?? []
check("members list shows 3 people with emails", members.length === 3, r.body)
const viewerMember = members.find((m) => (m.customer?.email ?? m.email) === em("viewer","club.example.com"))
const ownerMember = members.find((m) => (m.customer?.email ?? m.email) === em("owner","club.example.com"))
r = await api("POST", `/store/customers/me/organisations/${org.id}/members/${viewerMember?.id}`, { token: buyer.token, body: { role: "owner" } })
const viewerRole = (await db.query("select role from organisation_member where id=$1", [viewerMember?.id])).rows[0]?.role
check("purchaser cannot change roles (refused, role unchanged)", r.status >= 400 && viewerRole === "viewer", { status: r.status, viewerRole })
r = await api("POST", `/store/customers/me/organisations/${org.id}/members/${ownerMember?.id}`, { token: owner.token, body: { role: "viewer" } })
check("last owner cannot demote themselves", r.status >= 400, r.status)
r = await api("DELETE", `/store/customers/me/organisations/${org.id}/members/${ownerMember?.id}`, { token: owner.token })
check("last owner cannot remove themselves", r.status >= 400, r.status)

describe("Optional tabs (Uniform allowance, Brand kit)")
const orgPage = () => api("GET", `/store/customers/me/organisations/${org.id}`, { token: owner.token })
r = await orgPage()
check("off by default", r.status === 200 && Array.isArray(r.body.organisation.portal_extras) && r.body.organisation.portal_extras.length === 0, r.body)
await A("POST", `/admin/organisations/${org.id}`, { portal_extras: ["allowance"] })
r = await orgPage()
check("staff switch one on: the member's page shows it", JSON.stringify(r.body.organisation.portal_extras) === '["allowance"]', r.body.organisation)
r = await A("POST", `/admin/organisations/${org.id}`, { portal_extras: ["nonsense"] })
check("an unknown tab name is refused", r.status === 400, r.status)
r = await A("POST", `/admin/organisations/${org.id}`, { notes: "kept" })
check("saving something else leaves the switch alone", r.body.organisation?.metadata?.portal_extras?.[0] === "allowance" && r.body.organisation?.default_pricing_tier === "silver", r.body.organisation)

describe("Invites")
r = await api("POST", `/store/customers/me/organisations/${org.id}/invites`, { token: buyer.token, body: { email: em("newstaff","club.example.com"), role: "purchaser" } })
check("purchaser cannot invite", r.status === 404 || r.status === 403, r.status)
r = await api("POST", `/store/customers/me/organisations/${org.id}/invites`, { token: owner.token, body: { email: em("buyer","club.example.com"), role: "purchaser" } })
check("inviting an existing member is refused (409)", r.status === 409, r)
r = await api("POST", `/store/customers/me/organisations/${org.id}/invites`, { token: owner.token, body: { email: em("newstaff","club.example.com").replace("newstaff","NewStaff"), role: "purchaser" } })
check("owner invites a new staff member", r.status === 201, r.body)
const inviteId = r.body.invite?.id
r = await api("GET", `/store/customers/me/organisations/${org.id}/invites`, { token: owner.token })
check("pending invite listed, no token shown", JSON.stringify(r.body).includes(invitee.email) && !JSON.stringify(r.body).includes("token_hash"), r.body)

// The emailed token is random; plant a known one on the invite (same sha256 the route uses).
const token = randomBytes(24).toString("base64url")
await db.query(`update organisation_invite set token_hash=$1 where id=$2`, [createHash("sha256").update(token).digest("hex"), inviteId])
r = await api("POST", `/store/customers/me/organisation-invites/${token}/accept`, { token: outsider.token })
check("wrong account cannot accept the invite", r.status === 403 && r.body.code === "wrong_email", r.body)
await db.query(`update organisation_invite set email=$2 where id=$1`, [inviteId, unverified.email])
r = await api("POST", `/store/customers/me/organisation-invites/${token}/accept`, { token: unverified.token })
check("unconfirmed email cannot accept", r.status === 403 && r.body.code === "unverified", r.body)
await db.query(`update organisation_invite set email=$2 where id=$1`, [inviteId, invitee.email])
r = await api("POST", `/store/customers/me/organisation-invites/${token}/accept`, { token: invitee.token })
check("invited, confirmed account accepts", r.status === 200 && r.body.organisation_id === org.id, r.body)
check("new member got the organisation's Silver tier", (await tierOf(invitee.id)).includes("Tier: Silver"), await tierOf(invitee.id))
r = await api("POST", `/store/customers/me/organisation-invites/${token}/accept`, { token: invitee.token })
check("used invite link no longer works", r.status === 404, r.status)
r = await api("POST", `/store/customers/me/organisation-invites/not-a-real-token-123/accept`, { token: invitee.token })
check("unknown invite link: 404", r.status === 404, r.status)

describe("Tier change propagates")
r = await A("POST", `/admin/organisations/${org.id}`, { default_pricing_tier: "gold" })
check("staff change tier to Gold", r.status < 300, r.body)
check("owner moved to Gold", (await tierOf(owner.id)).includes("Tier: Gold"), await tierOf(owner.id))
check("owner no longer Silver", !(await tierOf(owner.id)).includes("Tier: Silver"), await tierOf(owner.id))
await A("POST", `/admin/organisations/${org.id}`, { default_pricing_tier: "silver" })
check("moved DOWN to Silver", (await tierOf(owner.id)).includes("Tier: Silver"), await tierOf(owner.id))
check("Gold taken back on the way down", !(await tierOf(owner.id)).includes("Tier: Gold"), await tierOf(owner.id))

describe("Leaving takes the tier back, personal tiers are kept")
// A customer staff already put on Platinum themselves joins, then leaves.
const vip = await customer(em("vip", "club.example.com"), { first: "Vee", last: "Ip" })
const plat = (await db.query(`select id from customer_group where name='Tier: Platinum'`)).rows[0].id
const silver = (await db.query(`select id from customer_group where name='Tier: Silver'`)).rows[0].id
await db.query(`insert into customer_group_customer (id, customer_id, customer_group_id, created_at, updated_at) values ($1,$2,$3,now(),now())`, ["cusgc_" + RUN + "a", vip.id, plat])
await db.query(`insert into customer_group_customer (id, customer_id, customer_group_id, created_at, updated_at) values ($1,$2,$3,now(),now())`, ["cusgc_" + RUN + "b", vip.id, silver])
r = await A("POST", `/admin/organisations/${org.id}/members`, { customer_id: vip.id, role: "purchaser" })
r = await A("DELETE", `/admin/organisations/${org.id}/members?customer_id=${vip.id}`)
check("customer with their own Silver keeps it after leaving", (await tierOf(vip.id)).includes("Tier: Silver"), await tierOf(vip.id))
check("…and keeps their own Platinum", (await tierOf(vip.id)).includes("Tier: Platinum"), await tierOf(vip.id))
const leaver = await customer(em("leaver", "club.example.com"))
await A("POST", `/admin/organisations/${org.id}/members`, { customer_id: leaver.id, role: "purchaser" })
check("staff-added member gets Silver", (await tierOf(leaver.id)).includes("Tier: Silver"), await tierOf(leaver.id))
await A("DELETE", `/admin/organisations/${org.id}/members?customer_id=${leaver.id}`)
check("removed by staff: Silver taken back", !(await tierOf(leaver.id)).includes("Tier: Silver"), await tierOf(leaver.id))
await A("POST", `/admin/organisations/${org.id}/members`, { customer_id: leaver.id, role: "viewer" })
const lm = (await db.query("select id from organisation_member where customer_id=$1 and organisation_id=$2 and deleted_at is null", [leaver.id, org.id])).rows[0]?.id
r = await api("DELETE", `/store/customers/me/organisations/${org.id}/members/${lm}`, { token: owner.token })
check("owner removes a member", r.status === 200, r.body)
check("removed by owner: Silver taken back", !(await tierOf(leaver.id)).includes("Tier: Silver"), await tierOf(leaver.id))
// In two organisations on the same tier: leaving one keeps it.
const both = await customer(em("both", "club.example.com"))
await A("POST", `/admin/organisations/${other.id}`, { default_pricing_tier: "silver" })
await A("POST", `/admin/organisations/${org.id}/members`, { customer_id: both.id, role: "viewer" })
await A("POST", `/admin/organisations/${other.id}/members`, { customer_id: both.id, role: "viewer" })
await A("DELETE", `/admin/organisations/${org.id}/members?customer_id=${both.id}`)
check("still in another Silver organisation: keeps Silver", (await tierOf(both.id)).includes("Tier: Silver"), await tierOf(both.id))
await A("POST", `/admin/organisations/${other.id}`, { default_pricing_tier: null })
check("other organisation's tier cleared: Silver gone", !(await tierOf(both.id)).includes("Tier: Silver"), await tierOf(both.id))
check("outsider (other org owner) lost Silver when cleared", !(await tierOf(outsider.id)).includes("Tier: Silver"), await tierOf(outsider.id))

fs.writeFileSync(new URL("./state.json", import.meta.url), JSON.stringify({ org, other, owner, buyer, viewer, outsider, invitee, unverified }, null, 1))
process.exit(summary(new URL("./t1.json", import.meta.url).pathname) ? 1 : 0)
