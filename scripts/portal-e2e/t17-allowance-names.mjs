// 28 Nov: uniform allowance lines carry who each line is for.
import fs from "fs"
import { api, check, db, describe, newCart, summary } from "./lib.mjs"

const st = JSON.parse(fs.readFileSync(new URL("./state.json", import.meta.url)))
const { org, buyer, poloDesign } = st
const S = (m, p, who, body) => api(m, p, { token: who.token, body })
const P = (m, token, body) => api(m, `/store/allowance/${token}`, { body })
const base = `/store/customers/me/organisations/${org.id}`

describe("Uniform allowance: names on each line")
let r = await S("PUT", `${base}/roster`, buyer, { members: [
  { name: "Ann Able", unit: "HQ", sizes: { tops: "M" } },
  { name: "Ben Best", unit: "HQ", sizes: { tops: "L" } },
] })
check("roster of 2", r.status < 300, r.body)
r = await S("POST", `${base}/allowances`, buyer, { name: "Names test", closes_on: "2030-12-31", items: [{ design_id: poloDesign.id, per_person: 2 }] })
check("allowance created", r.status === 201, r.body)
const al = r.body.id
r = await S("GET", `${base}/allowances/${al}`, buyer)
const tok = Object.fromEntries((r.body.people ?? []).map((p) => [p.name, p.token]))
r = await P("POST", tok["Ann Able"], { picks: [{ design_id: poloDesign.id, size: "M", quantity: 2 }] })
check("Ann picks 2 polos M", r.status === 200, r.body)
r = await P("POST", tok["Ben Best"], { picks: [{ design_id: poloDesign.id, size: "M", quantity: 1 }, { design_id: poloDesign.id, size: "L", quantity: 1 }] })
check("Ben picks polo M + polo L", r.status === 200, r.body)
const cart = await newCart(buyer.token)
r = await S("POST", `${base}/allowances/${al}/add-to-cart`, buyer, { cart_id: cart.id })
check("added to the cart", r.status === 200 && r.body.added_lines >= 2, r.body)

const lines = (await db.query(
  `select li.quantity, li.variant_title, li.metadata from cart_line_item li where li.cart_id = $1 and li.deleted_at is null and li.metadata ? 'source_design_id'`,
  [cart.id]
)).rows
const people = (title) => lines.find((l) => l.variant_title?.includes(title))?.metadata?.allowance_people
check("2 garment lines (M and L)", lines.length === 2, lines.map((l) => [l.variant_title, l.quantity]))
check(
  "the M line (×3) names Ann ×2 and Ben ×1",
  JSON.stringify(people("/ M")) === JSON.stringify([{ name: "Ann Able", quantity: 2 }, { name: "Ben Best", quantity: 1 }]),
  people("/ M")
)
check("the L line names Ben only", JSON.stringify(people("/ L")) === JSON.stringify([{ name: "Ben Best", quantity: 1 }]), people("/ L"))

// A customer can't forge names onto a line through the core line-items route? They can only through
// the scp routes' allowlist, which is fine: names are information, not price.
process.exit(summary("t17.json") ? 1 : 0)
