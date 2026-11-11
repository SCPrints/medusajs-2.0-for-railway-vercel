import { garmentHex } from "../service"

describe("garmentHex: the garment's colour for the artwork panels", () => {
  it("finds a colour by product and name, whatever the case", () => {
    expect(garmentHex("as-colour-staple-tee-5001", "Black")).toMatch(/^#[0-9a-f]{6}$/i)
    expect(garmentHex("as-colour-staple-tee-5001", "BLACK")).toBe(garmentHex("as-colour-staple-tee-5001", "black"))
  })
  it("is null for an unknown product or colour, and for no colour", () => {
    expect(garmentHex("no-such-product", "Black")).toBeNull()
    expect(garmentHex("as-colour-staple-tee-5001", "")).toBeNull()
    expect(garmentHex("as-colour-staple-tee-5001", "Definitely Not A Colour")).toBeNull()
  })
})
