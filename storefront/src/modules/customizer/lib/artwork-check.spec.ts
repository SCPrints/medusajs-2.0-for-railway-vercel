import { checkArtwork } from "./artwork-check"

describe("checkArtwork", () => {
  it("passes a big PNG", () => {
    expect(checkArtwork({ mimeType: "image/png", widthPx: 3000, heightPx: 3000, hasTransparency: null })).toEqual({ ok: true, label: "Print-ready" })
  })
  it("flags a small picture with its sharp width", () => {
    const r = checkArtwork({ mimeType: "image/png", widthPx: 900, heightPx: 900, hasTransparency: null })
    expect(r).toEqual({ ok: false, notes: ["This picture is small. It will print sharp up to about 9 cm wide."] })
  })
  it("notes JPG backgrounds and passes vectors", () => {
    const r = checkArtwork({ mimeType: "image/jpeg", widthPx: 4000, heightPx: 4000, hasTransparency: false })
    expect(r.ok === false && r.notes).toHaveLength(1)
    expect(checkArtwork({ mimeType: "image/svg+xml", widthPx: 1, heightPx: 1, hasTransparency: true }).ok).toBe(true)
  })
  it("uses the intended print width", () => {
    expect(checkArtwork({ mimeType: "image/png", widthPx: 900, heightPx: 900, hasTransparency: null, printWidthCm: 8 }).ok).toBe(true)
  })
})
