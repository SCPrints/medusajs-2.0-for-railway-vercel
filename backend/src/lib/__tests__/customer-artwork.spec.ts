import {
  extractProofArtwork, extractOrderOriginalFiles, isOurPublicFileUrl } from "../customer-artwork"
import { assertCanShareTo, isVisibleTo, sharingFields, type CustomerOrg } from "../customer-org-sharing"

const BASE = "https://pub-abc.r2.dev"

describe("isOurPublicFileUrl", () => {
  it("accepts files under the public base (trailing slash on base ok)", () => {
    expect(isOurPublicFileUrl(`${BASE}/customizer/a.png`, BASE)).toBe(true)
    expect(isOurPublicFileUrl(`${BASE}/customizer/a.png`, `${BASE}/`)).toBe(true)
  })
  it("rejects look-alike hosts, the bare base, other hosts and non-urls", () => {
    expect(isOurPublicFileUrl("https://pub-abc.r2.dev.evil.com/a.png", BASE)).toBe(false)
    expect(isOurPublicFileUrl(`${BASE}/`, BASE)).toBe(false)
    expect(isOurPublicFileUrl("https://example.com/a.png", BASE)).toBe(false)
    expect(isOurPublicFileUrl("not a url", BASE)).toBe(false)
    expect(isOurPublicFileUrl("javascript:alert(1)", null)).toBe(false)
  })
  it("with no base configured (dev) accepts any http(s) url", () => {
    expect(isOurPublicFileUrl("http://localhost:9000/x.png", undefined)).toBe(true)
  })
})

describe("extractOrderOriginalFiles", () => {
  it("dedupes by url (first row wins), defaults names, skips junk", () => {
    const out = extractOrderOriginalFiles([
      {
        order_id: "order_new",
        originals: [
          { url: `${BASE}/a.png`, fileName: "Logo.png", mimeType: "image/png", sides: ["front"] },
          { url: "  " },
          null,
          { url: "data:image/png;base64,xx" },
        ],
      },
      { order_id: "order_old", originals: [{ url: `${BASE}/a.png`, fileName: "Old.png" }, { url: `${BASE}/b.svg` }] },
      { order_id: "order_x", originals: null },
    ])
    expect(out).toEqual([
      { url: `${BASE}/a.png`, name: "Logo.png", mime_type: "image/png", source_order_id: "order_new" },
      { url: `${BASE}/b.svg`, name: "Artwork", mime_type: "application/octet-stream", source_order_id: "order_old" },
    ])
  })
})

describe("org sharing", () => {
  const orgs: CustomerOrg[] = [
    { organisation_id: "org_1", organisation_name: "Club", role: "purchaser" },
    { organisation_id: "org_2", organisation_name: "School", role: "viewer" },
  ]
  it("own rows are editable with no shared_from; others' shared rows are read-only", () => {
    expect(sharingFields({ customer_id: "me", organisation_id: "org_1" }, "me", orgs)).toEqual({
      can_edit: true,
      shared_from: null,
    })
    expect(sharingFields({ customer_id: "them", organisation_id: "org_1" }, "me", orgs)).toEqual({
      can_edit: false,
      shared_from: { organisation_id: "org_1", organisation_name: "Club" },
    })
  })
  it("visibility: own, or shared to one of my orgs", () => {
    expect(isVisibleTo({ customer_id: "me" }, "me", [])).toBe(true)
    expect(isVisibleTo({ customer_id: "them", organisation_id: "org_2" }, "me", orgs)).toBe(true)
    expect(isVisibleTo({ customer_id: "them", organisation_id: "org_9" }, "me", orgs)).toBe(false)
    expect(isVisibleTo({ customer_id: "them", organisation_id: null }, "me", orgs)).toBe(false)
  })
  it("sharing needs owner/purchaser membership", () => {
    expect(() => assertCanShareTo(orgs, "org_1")).not.toThrow()
    expect(() => assertCanShareTo(orgs, "org_2")).toThrow(/requires/)
    expect(() => assertCanShareTo(orgs, "org_9")).toThrow(/not found/)
  })
})

describe("extractProofArtwork", () => {
  it("takes approved PNG/JPEG/SVG artwork once per URL and names it by order", () => {
    const out = extractProofArtwork([
      {
        order_id: "order_2",
        display_id: 91,
        proofs: [
          { artwork_url: "https://files/a.png?x=1", side: "left_sleeve" },
          { artwork_url: "https://files/print.pdf", side: "front" },
          { url: "https://files/mockup.jpg" },
        ],
      },
      { order_id: "order_1", display_id: 80, proofs: [{ artwork_url: "https://files/a.png?x=1", side: "front" }] },
      { order_id: "order_0", proofs: null },
    ])
    expect(out).toEqual([
      {
        url: "https://files/a.png?x=1",
        name: "Approved artwork · order #91 · left sleeve",
        mime_type: "image/png",
        source_order_id: "order_2",
      },
    ])
  })
})
