import { asColourHandle } from "../ascolour-handle"

describe("asColourHandle", () => {
  it.each([
    ["Staple Tee | 5001", "5001", "as-colour-staple-tee-5001"],
    ["Staple Tee", "5001", "as-colour-staple-tee-5001"],
    ["5056 General LS Tee", "5056", "as-colour-general-ls-tee-5056"],
    ["Wo's Maple L/S Tee | 4020", "4020", "as-colour-womens-maple-long-sleeve-tee-4020"],
    ["Linen S/S Shirt", "5420", "as-colour-linen-short-sleeve-shirt-5420"],
    ["Wo's Classic Minus Tee 5cm 4079", "4079", "as-colour-womens-classic-minus-tee-5cm-4079"],
    ["Frame Two Tone Camo Cap", "1165C", "as-colour-frame-two-tone-camo-cap-1165c"],
    [undefined, "9999", "as-colour-product-9999"],
  ])("%s / %s → %s", (name, code, expected) => {
    expect(asColourHandle(name, code)).toBe(expected)
  })
})
