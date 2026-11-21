import { cleanBrandKit, normaliseHex } from "../brand-kit"

describe("brand kit", () => {
  it("normalises hex", () => {
    expect(normaliseHex("#abc")).toBe("#AABBCC")
    expect(normaliseHex("12ab34")).toBe("#12AB34")
    expect(normaliseHex("#12")).toBeNull()
  })
  it("accepts a good kit and dedupes fonts", () => {
    const res = cleanBrandKit({
      colours: [{ name: "Navy", hex: "#001f3f", pantone: "289 C" }],
      fonts: ["Inter", "Inter"],
      placement_notes: "Left chest.",
      logo_artwork_ids: ["cuart_1"],
    })
    expect(res.ok && res.kit.colours[0]).toEqual({ name: "Navy", hex: "#001F3F", pantone: "289 C" })
    expect(res.ok && res.kit.fonts).toEqual(["Inter"])
  })
  it("rejects bad hex and caps", () => {
    expect(cleanBrandKit({ colours: [{ name: "x", hex: "red" }] }).ok).toBe(false)
    expect(cleanBrandKit({ colours: Array(25).fill({ name: "a", hex: "#fff" }) }).ok).toBe(false)
    expect(cleanBrandKit({ fonts: Array(11).fill("a") }).ok).toBe(false)
    expect(cleanBrandKit({ placement_notes: "a".repeat(2001) }).ok).toBe(false)
  })
})
