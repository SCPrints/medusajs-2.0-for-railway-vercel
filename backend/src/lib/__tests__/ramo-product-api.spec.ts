import {
  parseRamoProductApi,
  matchColoursToVariants,
  ramoImageUrl,
  styleFromVariantCode,
  RAMO_IMAGE_BASE,
} from "../ramo-product-api"

/**
 * Fixture mirroring the real `get_retail_product.cgi?webname=dog-hoodies-01`
 * response shape (trimmed). Captures the load-bearing quirks:
 *  - `shared_model_images` (lifestyle shots) also appear inside a colour's list
 *  - the primary colour ("Red") interleaves shared shots + many detail shots
 *    and lists `_back` before `_front` in source order
 *  - other colours list `_front` then `_back`
 *  - `products[colour][size].code` carries the `<STYLE>_<CC>_<SIZE>` code
 *  - `attributes` carries the canonical colour name + hex
 */
const DOG_FIXTURE = {
  metadata: {
    shared_model_images: ["f377dg_1.jpg", "f377dg_2.jpg"],
    colour_images: {
      Red: {
        images: [
          { sort_order: 1, filename: "f377dg_1.jpg", sort_value: "0" },
          { sort_order: 4, filename: "f377dg_2.jpg", sort_value: "0" },
          { sort_order: 0, filename: "f377dg_red_back.jpg", sort_value: 50 },
          { sort_order: 0, filename: "f377dg_red_detail1.jpg", sort_value: 50 },
          { sort_order: 0, filename: "f377dg_red_detail2.jpg", sort_value: 50 },
          { sort_order: 0, filename: "f377dg_red_front.jpg", sort_value: 50 },
        ],
      },
      Olive: {
        images: [
          { sort_order: 2, filename: "f377dg_olive_front.jpg", sort_value: 52 },
          { sort_order: 3, filename: "f377dg_olive_back.jpg", sort_value: 53 },
        ],
      },
      "Navy Blue": {
        images: [
          { sort_order: 2, filename: "f377dg_navy_front.jpg", sort_value: 52 },
          { sort_order: 3, filename: "f377dg_navy_back.jpg", sort_value: 53 },
        ],
      },
    },
  },
  attributes: [
    { attribute: "Colour", value: "Azure", colour1: "087bb9", colour2: null, colour3: null },
    { attribute: "Colour", value: "Red", colour1: "c8102e", colour2: null, colour3: null },
    { attribute: "Size", value: "S" },
  ],
  products: {
    Red: {
      S: { colour: "Red", code: "F377DG_RE_S", price: 30 },
      M: { colour: "Red", code: "F377DG_RE_M", price: 30 },
    },
    Olive: {
      S: { colour: "Olive", code: "F377DG_OL_S", price: 30 },
    },
  },
}

describe("ramo-product-api helpers", () => {
  test("ramoImageUrl + styleFromVariantCode", () => {
    expect(ramoImageUrl("f377dg_olive_front.jpg")).toBe(
      `${RAMO_IMAGE_BASE}f377dg_olive_front.jpg`
    )
    expect(styleFromVariantCode("F377DG_RE_S")).toBe("F377DG")
    expect(styleFromVariantCode("tp212h_la_xl")).toBe("TP212H")
    // Neto parent artifact: must still resolve to the bare style.
    expect(styleFromVariantCode("TP212H--5_GO_S")).toBe("TP212H")
  })

  describe("parseRamoProductApi", () => {
    const parsed = parseRamoProductApi(DOG_FIXTURE)!

    test("derives the style code (filename-first, code as fallback)", () => {
      expect(parsed.styleCode).toBe("F377DG")
      // Clean filename wins even when the variant code is malformed.
      const messy = parseRamoProductApi({
        metadata: { colour_images: { Red: { images: [{ filename: "tp212h_red_front.jpg" }] } } },
        attributes: [],
        products: { Red: { S: { colour: "Red", code: "TP212H--5_RE_S" } } },
      })!
      expect(messy.styleCode).toBe("TP212H")
    })

    test("front is the colour-specific front shot, never a shared model shot", () => {
      expect(parsed.colourImages["Olive"].front).toBe(
        ramoImageUrl("f377dg_olive_front.jpg")
      )
      expect(parsed.colourImages["Navy Blue"].front).toBe(
        ramoImageUrl("f377dg_navy_front.jpg")
      )
      // Red interleaves shared shots + lists back before front in source order;
      // we must still pick the colour-specific FRONT, not a model shot.
      expect(parsed.colourImages["Red"].front).toBe(
        ramoImageUrl("f377dg_red_front.jpg")
      )
    })

    test("colour 'all' = specific (front→back→detail), then shared model shots", () => {
      expect(parsed.colourImages["Olive"].all).toEqual([
        ramoImageUrl("f377dg_olive_front.jpg"),
        ramoImageUrl("f377dg_olive_back.jpg"),
      ])
      const red = parsed.colourImages["Red"].all
      // front first, back second, details next, shared model shots last
      expect(red[0]).toBe(ramoImageUrl("f377dg_red_front.jpg"))
      expect(red[1]).toBe(ramoImageUrl("f377dg_red_back.jpg"))
      expect(red[red.length - 2]).toBe(ramoImageUrl("f377dg_1.jpg"))
      expect(red[red.length - 1]).toBe(ramoImageUrl("f377dg_2.jpg"))
    })

    test("exposes shared model shots separately for the generic fallback", () => {
      expect(parsed.modelImageUrls).toEqual([
        ramoImageUrl("f377dg_1.jpg"),
        ramoImageUrl("f377dg_2.jpg"),
      ])
    })

    test("product gallery = model shots + per-colour front/back, no detail clutter", () => {
      expect(parsed.gallery).toEqual([
        ramoImageUrl("f377dg_1.jpg"),
        ramoImageUrl("f377dg_2.jpg"),
        ramoImageUrl("f377dg_red_front.jpg"),
        ramoImageUrl("f377dg_red_back.jpg"),
        ramoImageUrl("f377dg_olive_front.jpg"),
        ramoImageUrl("f377dg_olive_back.jpg"),
        ramoImageUrl("f377dg_navy_front.jpg"),
        ramoImageUrl("f377dg_navy_back.jpg"),
      ])
      // detail close-ups are deliberately excluded from the headline grid
      expect(
        parsed.gallery.some((u) => u.includes("_detail"))
      ).toBe(false)
    })

    test("captures attribute colours with hex", () => {
      expect(parsed.attributeColours).toEqual([
        { value: "Azure", hex: "#087bb9" },
        { value: "Red", hex: "#c8102e" },
      ])
    })

    test("returns null for an empty/miss payload", () => {
      expect(parseRamoProductApi({ metadata: null, attributes: [], products: {} })).toBeNull()
      expect(parseRamoProductApi(null)).toBeNull()
    })
  })

  describe("matchColoursToVariants", () => {
    const parsed = parseRamoProductApi(DOG_FIXTURE)!

    test("exact (case-insensitive) match", () => {
      const { matched, unmatched } = matchColoursToVariants(
        ["Olive", "navy blue"],
        parsed.colourImages
      )
      expect(matched["Olive"].front).toBe(ramoImageUrl("f377dg_olive_front.jpg"))
      expect(matched["navy blue"].front).toBe(ramoImageUrl("f377dg_navy_front.jpg"))
      expect(unmatched).toEqual([])
    })

    test("unambiguous substring fallback ('Navy' ↔ 'Navy Blue')", () => {
      const { matched, unmatched } = matchColoursToVariants(["Navy"], parsed.colourImages)
      expect(matched["Navy"].front).toBe(ramoImageUrl("f377dg_navy_front.jpg"))
      expect(unmatched).toEqual([])
    })

    test("reports colours RAMO has no images for", () => {
      const { matched, unmatched } = matchColoursToVariants(
        ["Lavender", "Sand"],
        parsed.colourImages
      )
      expect(Object.keys(matched)).toEqual([])
      expect(unmatched).toEqual(["Lavender", "Sand"])
    })

    test("solid colour prefers the solid RAMO label over contrast colourways", () => {
      // Shape mirrors RAMO's accelerator polo (P446): solid "Navy Blue" /
      // "Royal Blue" alongside contrast colourways. Our plain "Navy"/"Royal"
      // must land on the solid, not a two-tone, and not be dropped as ambiguous.
      const ramo = {
        "Navy/Red": { front: "navy_red", all: ["navy_red"] },
        "Navy/White": { front: "navy_white", all: ["navy_white"] },
        "Navy Blue": { front: "navy_blue", all: ["navy_blue"] },
        "Royal/White": { front: "royal_white", all: ["royal_white"] },
        "Royal Blue": { front: "royal_blue", all: ["royal_blue"] },
        "Black/Gold": { front: "black_gold", all: ["black_gold"] },
      }
      const { matched, unmatched } = matchColoursToVariants(
        ["Navy", "Royal", "Black/Gold"],
        ramo
      )
      expect(matched["Navy"].front).toBe("navy_blue")
      expect(matched["Royal"].front).toBe("royal_blue")
      // an exact contrast match still resolves exactly
      expect(matched["Black/Gold"].front).toBe("black_gold")
      expect(unmatched).toEqual([])
    })

    test("plain colour prefers the solid over a marled sibling", () => {
      // RAMO sloppy joe / heavy hoodie ship "Navy Marl" AND "Navy Blue".
      const ramo = {
        "Navy Marl": { front: "navy_marl", all: ["navy_marl"] },
        "Navy Blue": { front: "navy_blue", all: ["navy_blue"] },
        "Grey Marl": { front: "grey_marl", all: ["grey_marl"] },
      }
      const { matched, unmatched } = matchColoursToVariants(
        ["Navy", "Grey Marl"],
        ramo
      )
      expect(matched["Navy"].front).toBe("navy_blue")
      // when OUR value itself names the marl, it still resolves exactly
      expect(matched["Grey Marl"].front).toBe("grey_marl")
      expect(unmatched).toEqual([])
    })
  })
})
