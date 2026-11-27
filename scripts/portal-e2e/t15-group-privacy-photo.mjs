// 27 Nov: group order share link shows names only to the organiser; cart lines get their colour's photo.
import { api, check, customer, db, describe, summary } from "./lib.mjs"

const RUN = Date.now().toString(36)
const S = (m, p, who, body) => api(m, p, { token: who.token, body })
const polo = (await db.query("select id from product where handle='test-polo'")).rows[0].id
await db.query(`insert into image (id, url, rank, product_id) values
  ('img_t15_blue', 'https://example.com/5001_STAPLE_TEE_BLUE__front.jpg', 0, $1),
  ('img_t15_navy', 'https://example.com/5001_STAPLE_TEE_NAVY__front.jpg', 1, $1) on conflict do nothing`, [polo])
const variants = (await db.query(`select v.id, v.title from product_variant v where v.product_id=$1 and v.deleted_at is null`, [polo])).rows
const base = variants.find((v) => v.title === "Navy / M")
const design = {
  version: 2, type: "fabric_customizer", method: "print", variantId: base.id,
  prints: [{ side: "front", sizeId: "up_to_a6", approxCm: { width: 9, height: 6 } }],
  artifacts: [{ side: "front", printFileUrl: "https://example.com/p.png", mockupUrl: "https://example.com/m.png", print_size_id: "up_to_a6" }],
  sideLayouts: {}, activeSide: "front",
}

describe("Group order share link: names only for the organiser")
const owner = await customer(`goprivowner+${RUN}@example.com`, { first: "Olive", last: "Owner" })
const stranger = await customer(`goprivother+${RUN}@example.com`, { first: "Sam", last: "Stranger" })
let r = await S("POST", "/store/customers/me/designs", owner, { name: "GO privacy", base_product_id: polo, base_variant_id: base.id, customizer_metadata: design })
r = await S("POST", "/store/group-orders", owner, {
  title: "GO privacy", owner_email: owner.email, owner_name: "Olive Owner",
  base_product_id: polo, base_variant_id: base.id, base_design_id: r.body.design?.id, customizer_metadata: design,
})
const go = r.body.group_order
check("group order created", !!go?.public_token, r.body)
r = await api("POST", `/store/group-orders/${go.public_token}/participants`, { body: { name: "Mem Ber", size_label: "M", quantity: 2, player_number: "7" } })
check("member joins", r.status < 300, r.body)

r = await api("GET", `/store/group-orders/${go.public_token}`)
check("guest: count only, no names", r.status === 200 && r.body.participant_count === 1 && r.body.participants.length === 0, { count: r.body.participant_count, n: r.body.participants?.length })
check("guest: no name anywhere in the response", !JSON.stringify(r.body).includes("Mem Ber"))
check("share page photo is the NAVY front photo (the organiser's colour)", r.body.product_preview?.thumbnail === "https://example.com/5001_STAPLE_TEE_NAVY__front.jpg", r.body.product_preview)
r = await S("GET", `/store/group-orders/${go.public_token}`, stranger)
check("another signed-in customer: no names", r.status === 200 && r.body.participants.length === 0 && r.body.participant_count === 1, { n: r.body.participants?.length })
r = await S("GET", `/store/group-orders/${go.public_token}`, owner)
check("organiser: sees the name, size and number", r.status === 200 && r.body.participants[0]?.name === "Mem Ber" && r.body.participants[0]?.size_label === "M" && r.body.participants[0]?.player_number === "7", r.body.participants)

describe("Group order cart line: the colour's own photo")
await S("POST", `/store/customers/me/group-orders/${go.id}/status`, owner, { status: "closed" })
r = await S("POST", `/store/customers/me/group-orders/${go.id}/convert-to-cart`, owner, {})
check("convert builds one line", r.status === 200 && r.body.lines_added === 1, r.body)
const line = (await db.query("select thumbnail, metadata->>'colour_thumbnail' ct, variant_id from cart_line_item where cart_id=$1 and deleted_at is null", [r.body.cart_id])).rows[0]
check("line picture is the NAVY front photo, not the first (blue) photo", line?.thumbnail === "https://example.com/5001_STAPLE_TEE_NAVY__front.jpg", line)
check("line is flagged so the cart shows that photo", line?.ct === "true", line)

await db.query("delete from image where id in ('img_t15_blue','img_t15_navy')")
process.exit(summary("t15.json") ? 1 : 0)
