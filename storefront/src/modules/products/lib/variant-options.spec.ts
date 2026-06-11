import { HttpTypes } from "@medusajs/types"

import {
  garmentUrlViewRank,
  getGarmentImageUrlForPrintSide,
  getPrimaryGarmentImageUrl,
  getProductColorLabels,
  urlMatchesColorAmongSiblings,
  urlMatchesColorLabelStrict,
} from "./variant-options"

/**
 * Regression: 2026-06-10 — the customizer canvas showed BACK photos on
 * "EDITING: FRONT" for every colour whose images had been touched by the
 * repair script. Root cause: front selection took the FIRST colour-matching
 * url in `product.images` array order; the repair appended recovered colour
 * fronts AFTER the existing backs, flipping the pick to the back for BLACK /
 * GREY MARLE / RED / BUTTER / PINE GREEN / EUCALYPTUS / ORCHID.
 *
 * The fixture below is the REAL as-colour-5080-5080 image array, in the exact
 * prod order that triggered the bug (backs early, recovered fronts at indices
 * 31-40). Selection must be token-aware (front vs back vs side/turn/thumb) and
 * MUST NOT depend on array order — repair/scrape scripts and supplier
 * re-imports append and reorder freely.
 */

const CDN = "https://cdn11.bigcommerce.com/s-lqiq2tqil5/products/576/images"

// Exact prod order, post-repair (2026-06-10). Index comments mark the traps.
const HEAVY_TEE_5080_IMAGES = [
  "5080_HEAVY_TEE_BACK__93475.1709260365.1280.1280.jpg", // [0] generic BACK first!
  "5080_HEAVY_TEE_BLACK_BACK__98152.1779250608.1280.1280.jpg", // [1] back long before front [31]
  "5080_HEAVY_TEE_COBALT__50073.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_COBALT_BACK__94848.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_CYPRESS__24605.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_CYPRESS_BACK__19659.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_ECRU__42443.1751515945.1280.1280.jpg",
  "5080_HEAVY_TEE_ECRU_BACK__46171.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_EUCALYPTUS_BACK__20958.1779250608.1280.1280.jpg", // [8] back; front at [39]
  "5080_HEAVY_TEE_FRONT__15888.1709260350.1280.1280.jpg",
  "5080_HEAVY_TEE_GREY_MARLE_BACK__25232.1779250608.1280.1280.jpg", // [10] back; fronts at [28]/[33]
  "5080_HEAVY_TEE_MAIN__22457.1709260345.1280.1280.jpg",
  "5080_HEAVY_TEE_MIDNIGHT_BLUE__23758.1779250609.1280.1280.jpg",
  "5080_HEAVY_TEE_MIDNIGHT_BLUE_BACK__11614.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_NAVY__89420.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_ORCHID_BACK__56268.1779250608.1280.1280.jpg", // [15] back; front at [35]
  "5080_HEAVY_TEE_PINE_GREEN_BACK__13657.1779250608.1280.1280.jpg", // [16] back; front at [40]
  "5080_HEAVY_TEE_RED_BACK__39476.1779250608.1280.1280.jpg", // [17] back; front at [37]
  "5080_HEAVY_TEE_SIDE__09087.1709260361.1280.1280.jpg",
  "5080_HEAVY_TEE_TURN__23101.1709260356.1280.1280.jpg",
  "5080_HEAVY_TEE_WHITE__04782.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_BUTTER_BACK__28469.1751515945.386.513.jpg", // [21] back; front at [32]
  "5080_HEAVY_TEE_PISTACHIO__44490.1779251341.jpg",
  "5080_HEAVY_TEE_PISTACHIO_BACK__81758.1779251343.jpg",
  "5080_HEAVY_TEE_PISTACHIO_THUMB.jpg", // alt view — never the preferred front
  "5080_HEAVY_TEE_WALNUT__72580.1779251343.jpg",
  "5080_HEAVY_TEE_WALNUT_BACK__64638.1779251340.jpg",
  "5080_HEAVY_TEE_WALNUT_THUMB.jpg",
  "5080_HEAVY_TEE_GREY_MARLE__86773.1779251341.jpg",
  "5080_HEAVY_TEE_NAVY_BACK__88629.1779251340.jpg",
  "5080_HEAVY_TEE_CYPRESS_THUMB__55223.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_BLACK__27290.1779250608.1280.1280.jpg", // [31] recovered front (appended)
  "5080_HEAVY_TEE_BUTTER__11657.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_GREY_MARLE__52844.1779250609.1280.1280.jpg",
  "5080_HEAVY_TEE_NAVY_BACK__83507.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_ORCHID__64883.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_PISTACHIO__42714.1779250609.1280.1280.jpg",
  "5080_HEAVY_TEE_RED__04140.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_WHITE_BACK__58504.1779250608.1280.1280.jpg",
  "5080_HEAVY_TEE_EUCALYPTUS__78206.1779251340.jpg",
  "5080_HEAVY_TEE_PINE_GREEN__03221.1779251340.jpg",
].map((f) => `${CDN}/${f}?c=1`)

const ALL_COLOURS = [
  "BLACK",
  "BUTTER",
  "CYPRESS",
  "ECRU",
  "EUCALYPTUS",
  "GREY MARLE",
  "MIDNIGHT BLUE",
  "NAVY",
  "ORCHID",
  "PINE GREEN",
  "PISTACHIO",
  "RED",
  "WALNUT",
  "WHITE",
]

const buildProduct = (imageUrls: string[]): HttpTypes.StoreProduct =>
  ({
    id: "prod_5080",
    title: "Heavy Tee",
    handle: "as-colour-5080-5080",
    thumbnail: `${CDN}/5080_HEAVY_TEE_MAIN__22457.1709260345.1280.1280.jpg?c=1`,
    options: [
      { id: "opt_colour", title: "Colour" },
      { id: "opt_size", title: "Size" },
    ],
    images: imageUrls.map((url, i) => ({ id: `img_${i}`, url })),
  } as unknown as HttpTypes.StoreProduct)

const buildVariant = (colour: string): HttpTypes.StoreProductVariant =>
  ({
    id: `var_${colour}`,
    title: `${colour} / M`,
    metadata: {},
    options: [
      { option_id: "opt_colour", option: { title: "Colour" }, value: colour },
      { option_id: "opt_size", option: { title: "Size" }, value: "M" },
    ],
  } as unknown as HttpTypes.StoreProductVariant)

const fileOf = (url: string | null) =>
  (url ?? "").split("?")[0].split("/").pop()?.toUpperCase() ?? ""

const colourToken = (colour: string) => colour.replace(/[^A-Z0-9]+/gi, "_").toUpperCase()

describe("garment front/back selection is token-aware and order-independent", () => {
  const orderings: Array<[string, string[]]> = [
    ["prod order (backs first for repaired colours)", HEAVY_TEE_5080_IMAGES],
    ["reversed order", [...HEAVY_TEE_5080_IMAGES].reverse()],
  ]

  describe.each(orderings)("%s", (_label, imageUrls) => {
    const product = buildProduct(imageUrls)

    it.each(ALL_COLOURS)("front view for %s is the colour FRONT, never the back", (colour) => {
      const url = getGarmentImageUrlForPrintSide(
        product,
        buildVariant(colour),
        "front",
        null
      )
      const file = fileOf(url)
      const token = colourToken(colour)
      expect(file).toContain(`_${token}_`)
      expect(file).not.toContain(`_${token}_BACK`)
      expect(file).not.toContain(`_${token}_THUMB`)
    })

    it.each(ALL_COLOURS)("back view for %s is the colour BACK", (colour) => {
      const url = getGarmentImageUrlForPrintSide(
        product,
        buildVariant(colour),
        "back",
        null
      )
      expect(fileOf(url)).toContain(`_${colourToken(colour)}_BACK`)
    })

    it.each(ALL_COLOURS)(
      "primary garment image (cart/thumbnail paths) for %s is not the back",
      (colour) => {
        const url = getPrimaryGarmentImageUrl(product, buildVariant(colour))
        const file = fileOf(url)
        const token = colourToken(colour)
        expect(file).toContain(`_${token}_`)
        expect(file).not.toContain(`_${token}_BACK`)
      }
    )
  })

  it.each(ALL_COLOURS)(
    "gallery view-rank sort leads with the FRONT for %s (hero is never the back)",
    (colour) => {
      // Mirrors ImageGallery: colour-filter in array order, then stable
      // view-rank sort — the first entry is what renders as the hero photo.
      const strict = HEAVY_TEE_5080_IMAGES.filter((u) =>
        urlMatchesColorLabelStrict(u, colour)
      ).sort((a, b) => garmentUrlViewRank(a) - garmentUrlViewRank(b))
      expect(strict.length).toBeGreaterThan(0)
      const hero = fileOf(strict[0])
      const token = colourToken(colour)
      expect(hero).not.toContain(`_${token}_BACK`)
      expect(hero).not.toContain(`_${token}_THUMB`)
    }
  )

  it("no-colour fallback never lands on a back/side/turn shot even when one is first", () => {
    const product = buildProduct(HEAVY_TEE_5080_IMAGES) // index 0 is the generic BACK
    const variantNoColour = {
      id: "var_plain",
      metadata: {},
      options: [],
    } as unknown as HttpTypes.StoreProductVariant
    const file = fileOf(getPrimaryGarmentImageUrl(product, variantNoColour))
    expect(file).not.toContain("_BACK")
    expect(file).not.toContain("_SIDE_")
    expect(file).not.toContain("_TURN_")
  })
})

/**
 * Regression: 2026-06-11 — both swatches on the Staple Camo Tee rendered the
 * BLACK CAMO garment. The product's colours are "CAMO" and "BLACK CAMO": one
 * label is a substring of the other, so plain strict matching let "CAMO"
 * claim the `_BLACK_CAMO_` files too, and the black camo front (earlier in
 * `product.images`) won the frontish pick. Matching must be SIBLING-AWARE:
 * a colour never claims a file owned by a more specific sibling colour.
 *
 * Fixture is the REAL as-colour-5001c-5001c image array in exact prod order
 * (black camo files BEFORE green camo files — the trap).
 */
const CAMO_CDN = "https://cdn11.bigcommerce.com/s-lqiq2tqil5/products/431/images"

const STAPLE_CAMO_5001C_IMAGES = [
  "5001C_STAPLE_CAMO_TEE_CAMO_THUMB__59734.1590362849.1280.1280.jpg", // green thumb (alt view)
  "5001C_STAPLE_TEE_BACK__45752.1713216606.1280.1280.jpg",
  "5001C_STAPLE_CAMO_TEE_BLACK_CAMO__50796.1594588153.1280.1280.jpg", // black front BEFORE green front
  "5001C_STAPLE_CAMO_TEE_BLACK_CAMO_BACK__30237.1594588157.1280.1280.jpg",
  "5001C_STAPLE_CAMO_TEE_CAMO__87217.1590362848.1280.1280.jpg", // green front
  "5001C_STAPLE_CAMO_TEE_CAMO_BACK__07119.1590362848.1280.1280.jpg",
  "5001C_STAPLE_TEE_FRONT__82289.1713216597.1280.1280.jpg",
  "5001C_STAPLE_TEE_MAIN__90230.1713216595.1280.1280.jpg",
  "5001C_STAPLE_TEE_SIDE__81390.1713216602.1280.1280.jpg",
  "5001C_STAPLE_TEE_TURN__54105.1713216598.1280.1280.jpg",
].map((f) => `${CAMO_CDN}/${f}?c=1`)

const CAMO_COLOURS = ["CAMO", "BLACK CAMO"]

const buildCamoProduct = (
  imageUrls: string[],
  { optionValues = true }: { optionValues?: boolean } = {}
): HttpTypes.StoreProduct =>
  ({
    id: "prod_5001c",
    title: "Staple Camo Tee",
    handle: "as-colour-5001c-5001c",
    options: [
      {
        id: "opt_colour",
        title: "Colour",
        values: optionValues
          ? CAMO_COLOURS.map((value, i) => ({ id: `optval_${i}`, value }))
          : undefined,
      },
      { id: "opt_size", title: "Size" },
    ],
    variants: CAMO_COLOURS.map((colour) => buildVariant(colour)),
    images: imageUrls.map((url, i) => ({ id: `img_${i}`, url })),
  } as unknown as HttpTypes.StoreProduct)

describe("colour matching is sibling-aware (CAMO vs BLACK CAMO)", () => {
  const orderings: Array<[string, string[]]> = [
    ["prod order (black camo first)", STAPLE_CAMO_5001C_IMAGES],
    ["reversed order", [...STAPLE_CAMO_5001C_IMAGES].reverse()],
  ]

  describe.each(orderings)("%s", (_label, imageUrls) => {
    const product = buildCamoProduct(imageUrls)

    it("front view for CAMO is the green camo front, never a BLACK CAMO file", () => {
      const file = fileOf(
        getGarmentImageUrlForPrintSide(product, buildVariant("CAMO"), "front", null)
      )
      expect(file).toContain("_TEE_CAMO__")
      expect(file).not.toContain("BLACK_CAMO")
    })

    it("back view for CAMO is the green camo back, never a BLACK CAMO file", () => {
      const file = fileOf(
        getGarmentImageUrlForPrintSide(product, buildVariant("CAMO"), "back", null)
      )
      expect(file).toContain("_TEE_CAMO_BACK")
      expect(file).not.toContain("BLACK_CAMO")
    })

    it("front/back views for BLACK CAMO stay on the BLACK CAMO files", () => {
      const front = fileOf(
        getGarmentImageUrlForPrintSide(product, buildVariant("BLACK CAMO"), "front", null)
      )
      expect(front).toContain("_BLACK_CAMO__")
      const back = fileOf(
        getGarmentImageUrlForPrintSide(product, buildVariant("BLACK CAMO"), "back", null)
      )
      expect(back).toContain("_BLACK_CAMO_BACK")
    })

    it("primary garment image for CAMO is the green front (cart/canvas paths)", () => {
      const file = fileOf(getPrimaryGarmentImageUrl(product, buildVariant("CAMO")))
      expect(file).toContain("_TEE_CAMO__")
      expect(file).not.toContain("BLACK_CAMO")
    })

    it("gallery hero for CAMO is the green front (sibling-aware filter + view-rank sort)", () => {
      // Mirrors ImageGallery: sibling-aware colour filter, then view-rank sort.
      const labels = getProductColorLabels(product)
      const strict = imageUrls
        .filter((u) => urlMatchesColorAmongSiblings(u, "CAMO", labels))
        .sort((a, b) => garmentUrlViewRank(a) - garmentUrlViewRank(b))
      expect(strict.length).toBeGreaterThan(0)
      expect(strict.every((u) => !fileOf(u).includes("BLACK_CAMO"))).toBe(true)
      expect(fileOf(strict[0])).toContain("_TEE_CAMO__")
    })
  })

  it("colour labels fall back to variant option values when option.values is absent", () => {
    const product = buildCamoProduct(STAPLE_CAMO_5001C_IMAGES, { optionValues: false })
    expect(getProductColorLabels(product).map((l) => l.toUpperCase()).sort()).toEqual(
      ["BLACK CAMO", "CAMO"]
    )
    // …and the sibling-aware pick still resolves green camo correctly.
    const file = fileOf(getPrimaryGarmentImageUrl(product, buildVariant("CAMO")))
    expect(file).toContain("_TEE_CAMO__")
    expect(file).not.toContain("BLACK_CAMO")
  })

  it("degrades to plain strict matching when no sibling list is available", () => {
    // Empty sibling list = old behaviour (still matches its own files).
    expect(
      urlMatchesColorAmongSiblings(STAPLE_CAMO_5001C_IMAGES[4], "CAMO", [])
    ).toBe(true)
    expect(
      urlMatchesColorAmongSiblings(STAPLE_CAMO_5001C_IMAGES[2], "BLACK CAMO", [])
    ).toBe(true)
  })
})
