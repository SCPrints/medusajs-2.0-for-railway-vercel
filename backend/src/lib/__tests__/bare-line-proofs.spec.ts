import { bareLineProofs } from "../customizer-order-artifacts"
import { buildProofImages } from "../../services/artwork-approval/proof-email"

const black = { id: "li_black", product_id: "svc", title: "Oversize T, Black", metadata: null }
const light = { id: "li_light", product_id: "svc", title: "Active T, Light", metadata: null }
const designed = {
  id: "li_tee",
  product_id: "tee",
  title: "Staple Tee",
  metadata: {
    customizerDesign: {
      version: 2,
      artifacts: [{ side: "front", mockupUrl: "http://x/design-front.jpg" }],
    },
  },
}
const proof = (line_item_id: string, side: string, url: string, uploaded_at: string) => ({
  line_item_id,
  side,
  url,
  uploaded_at,
})

describe("bareLineProofs", () => {
  it("keeps the latest per line + side, separately for lines sharing a product", () => {
    const out = bareLineProofs([black, light], [
      proof("li_black", "front", "http://x/old.jpg", "2026-11-01"),
      proof("li_black", "front", "http://x/new.jpg", "2026-11-02"),
      proof("li_light", "front", "http://x/light.jpg", "2026-11-01"),
    ])
    expect(out.map((p) => [p.key, p.url])).toEqual([
      ["li_black:front", "http://x/new.jpg"],
      ["li_light:front", "http://x/light.jpg"],
    ])
    expect(out[0].side_label).toBe("Oversize T, Black — Front")
  })

  it("shares one mockup set across the size lines of a garment + colour", () => {
    const vest = (id: string, size: string) => ({
      id, product_id: "prod_vest", product_title: "Zip Safety Vest",
      title: `Zip Safety Vest — Lime / ${size}`, variant_title: `Lime / ${size}`, metadata: null,
    })
    const out = bareLineProofs([vest("li_l", "L"), vest("li_m", "M"), black], [
      proof("li_l", "front", "http://x/old.jpg", "2026-11-01"),
      proof("li_m", "front", "http://x/new.jpg", "2026-11-02"),
      proof("li_l", "back", "http://x/back.jpg", "2026-11-01"),
    ])
    expect(out.map((p) => [p.key, p.url, p.side_label])).toEqual([
      ["li_m:front", "http://x/new.jpg", "Zip Safety Vest · Lime — Front"],
      ["li_l:back", "http://x/back.jpg", "Zip Safety Vest · Lime — Back"],
    ])
  })

  it("skips lines with a design, other orders' lines and non-http urls", () => {
    expect(
      bareLineProofs([black, designed], [
        proof("li_tee", "front", "http://x/revised.jpg", "2026-11-02"),
        proof("li_other", "front", "http://x/other.jpg", "2026-11-02"),
        proof("li_black", "front", "data:image/png;base64,AA", "2026-11-02"),
      ])
    ).toEqual([])
    expect(bareLineProofs([black], undefined)).toEqual([])
  })
})

describe("buildProofImages", () => {
  it("adds bare-line mockups to the email without disturbing designed lines", () => {
    const { mockupImages, proofImageUrl } = buildProofImages({
      items: [designed, black],
      metadata: {
        revised_proofs: [
          proof("li_tee", "front", "http://x/revised.jpg", "2026-11-02"),
          proof("li_black", "back", "http://x/black-back.jpg", "2026-11-02"),
        ],
      },
    })
    expect(mockupImages).toEqual([
      expect.objectContaining({ side: "front", url: "http://x/revised.jpg" }),
      { side: "back", url: "http://x/black-back.jpg", sideLabel: "Oversize T, Black — Back" },
    ])
    expect(proofImageUrl).toBeNull()
  })

  it("beats the production-photo fallback once a bare line has a mockup", () => {
    const { mockupImages, proofImageUrl } = buildProofImages({
      items: [black],
      metadata: {
        production_photos: [{ url: "http://x/photo.jpg", uploaded_at: "2026-11-02" }],
        revised_proofs: [proof("li_black", "front", "http://x/m.jpg", "2026-11-01")],
      },
    })
    expect(mockupImages?.[0].url).toBe("http://x/m.jpg")
    expect(proofImageUrl).toBeNull()
  })
})
