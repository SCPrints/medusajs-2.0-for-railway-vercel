import { createHash } from "crypto"
import { hashEmail, buildCapiEvent } from "./meta-capi"

describe("hashEmail", () => {
  it("trims, lowercases, then sha256-hex — order-independent of casing/whitespace", () => {
    const expected = createHash("sha256").update("test@example.com").digest("hex")
    expect(hashEmail("  TEST@Example.com ")).toBe(expected)
    expect(hashEmail("test@example.com")).toBe(expected)
    expect(hashEmail("test@example.com")).toHaveLength(64)
  })
})

describe("buildCapiEvent", () => {
  const base = {
    event_id: "purchase_1001",
    event_time: 1000,
    value: 55.7,
    currency: "AUD",
  }

  it("hashes email + carries content when present", () => {
    const e = buildCapiEvent({ ...base, email: "a@b.com", content_ids: ["v1", "v2"] })
    expect(e.event_name).toBe("Purchase")
    expect(e.action_source).toBe("website")
    expect(e.event_id).toBe("purchase_1001")
    expect((e.user_data as any).em).toEqual([hashEmail("a@b.com")])
    expect((e.custom_data as any).content_ids).toEqual(["v1", "v2"])
    expect((e.custom_data as any).content_type).toBe("product")
    expect((e.custom_data as any).value).toBe(55.7)
  })

  it("omits em when no email and content_type when no ids (Meta rejects empties)", () => {
    const e = buildCapiEvent({ ...base })
    expect((e.user_data as any).em).toBeUndefined()
    expect((e.custom_data as any).content_ids).toBeUndefined()
    expect((e.custom_data as any).content_type).toBeUndefined()
    expect((e.custom_data as any).currency).toBe("AUD")
  })
})
