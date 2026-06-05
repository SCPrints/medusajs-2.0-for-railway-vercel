import {
  diffHasChanges,
  diffProduct,
  mergeMetadata,
  pricesDiffer,
} from "../supplier-product-sync"
import type {
  DesiredProduct,
  ExistingProductRow,
} from "../supplier-product-sync"

describe("supplier-product-sync — pricesDiffer", () => {
  const tiersAud = [
    { amount: 10, currency_code: "aud", min_quantity: 1, max_quantity: 9 },
    { amount: 9, currency_code: "aud", min_quantity: 10, max_quantity: 19 },
    { amount: 8, currency_code: "aud", min_quantity: 100 },
  ]
  it("returns false for identical ladders", () => {
    expect(pricesDiffer(tiersAud as any, tiersAud as any)).toBe(false)
  })
  it("returns false when amounts are within 0.005 (sub-cent rounding)", () => {
    const a = tiersAud.map((t) => ({ ...t, amount: t.amount + 0.001 }))
    expect(pricesDiffer(tiersAud as any, a)).toBe(false)
  })
  it("returns true when an amount differs by more than 1c", () => {
    const a = [...tiersAud]
    a[0] = { ...a[0], amount: 10.5 }
    expect(pricesDiffer(tiersAud as any, a)).toBe(true)
  })
  it("returns true when a tier is missing on one side", () => {
    const fewer = tiersAud.slice(0, 2)
    expect(pricesDiffer(tiersAud as any, fewer)).toBe(true)
  })
  it("returns true when string-typed amounts diverge", () => {
    const stringExisting = tiersAud.map((t) => ({ ...t, amount: String(t.amount) }))
    const desired = [...tiersAud]
    desired[0] = { ...desired[0], amount: 11 }
    expect(pricesDiffer(stringExisting as any, desired)).toBe(true)
  })
  it("treats unbounded max as the same band across sides", () => {
    const existing = [{ amount: 5, currency_code: "aud", min_quantity: 100 }]
    const desired = [{ amount: 5, currency_code: "aud", min_quantity: 100 }]
    expect(pricesDiffer(existing as any, desired)).toBe(false)
  })
})

describe("supplier-product-sync — mergeMetadata", () => {
  it("replaces the supplier key wholesale", () => {
    const r = mergeMetadata(
      { gildan: { code: "OLD" }, customizer: { foo: 1 } },
      { gildan: { code: "NEW", last_sync: "2026-01-01" } },
      "gildan"
    )
    expect(r.changed).toBe(true)
    expect(r.merged.gildan).toEqual({ code: "NEW", last_sync: "2026-01-01" })
    expect(r.merged.customizer).toEqual({ foo: 1 })
  })
  it("preserves existing non-supplier keys not present in desired", () => {
    const r = mergeMetadata(
      { gildan: { code: "OLD" }, seo: { title: "Staff override" } },
      { gildan: { code: "NEW" } },
      "gildan"
    )
    expect(r.merged.seo).toEqual({ title: "Staff override" })
  })
  it("does NOT overwrite existing non-supplier keys even when desired sets them", () => {
    // Staff customisations win — importer shouldn't clobber staff edits.
    const r = mergeMetadata(
      { seo: { title: "Staff override" } },
      { seo: { title: "From importer" } },
      "gildan"
    )
    expect(r.merged.seo).toEqual({ title: "Staff override" })
  })
  it("returns changed=false when nothing differs", () => {
    const r = mergeMetadata(
      { gildan: { code: "A" } },
      { gildan: { code: "A" } },
      "gildan"
    )
    expect(r.changed).toBe(false)
  })
  it("always overwrites source and last_sync", () => {
    const r = mergeMetadata(
      { source: "old", last_sync: "old" },
      { source: "gildan", last_sync: "2026-05-28" },
      "gildan"
    )
    expect(r.merged.source).toBe("gildan")
    expect(r.merged.last_sync).toBe("2026-05-28")
    expect(r.changed).toBe(true)
  })
})

describe("supplier-product-sync — diffProduct", () => {
  const baseExisting: ExistingProductRow = {
    id: "prod_1",
    handle: "gildan-64000",
    title: "Gildan 64000 Soft Style Tee",
    description: "Soft jersey tee.",
    thumbnail: "https://cdn/64000_Black_01.jpg",
    material: "100% Ring Spun Cotton",
    status: "published",
    images: [{ id: "img_1", url: "https://cdn/64000_Black_01.jpg" }],
    metadata: {
      gildan: { code: "64000", last_sync: "2026-01-01" },
      customizer: { print_area: { width: 30 } },
    },
    variants: [
      {
        id: "var_1",
        sku: "64000-BLK-M",
        title: "Black / M",
        metadata: { gildan: { color: "Black" } },
        prices: [
          { amount: 10, currency_code: "aud", min_quantity: 1, max_quantity: 9 },
          { amount: 8, currency_code: "aud", min_quantity: 100 },
        ],
      },
    ],
  }

  it("returns an empty diff when desired matches existing exactly", () => {
    const desired: DesiredProduct = {
      handle: "gildan-64000",
      title: "Gildan 64000 Soft Style Tee",
      description: "Soft jersey tee.",
      thumbnail: "https://cdn/64000_Black_01.jpg",
      material: "100% Ring Spun Cotton",
      images: [{ url: "https://cdn/64000_Black_01.jpg" }],
      metadata: {
        gildan: { code: "64000", last_sync: "2026-01-01" },
      },
      variants: [
        {
          sku: "64000-BLK-M",
          title: "Black / M",
          metadata: { gildan: { color: "Black" } },
          prices: [
            { amount: 10, currency_code: "aud", min_quantity: 1, max_quantity: 9 },
            { amount: 8, currency_code: "aud", min_quantity: 100 },
          ],
        },
      ],
    }
    const d = diffProduct({ desired, existing: baseExisting, supplierMetaKey: "gildan" })
    expect(diffHasChanges(d)).toBe(false)
  })

  it("detects title + description changes", () => {
    const desired: DesiredProduct = {
      handle: "gildan-64000",
      title: "Gildan 64000 Softstyle T-Shirt",
      description: "Softstyle adult tee.",
      images: baseExisting.images!.map((i) => ({ url: i.url })),
    }
    const d = diffProduct({ desired, existing: baseExisting, supplierMetaKey: "gildan" })
    expect(d.topLevelPatch.title).toBe("Gildan 64000 Softstyle T-Shirt")
    expect(d.topLevelPatch.description).toBe("Softstyle adult tee.")
    expect(d.reasons.length).toBeGreaterThan(0)
  })

  it("appends new image URLs without removing existing ones", () => {
    const desired: DesiredProduct = {
      handle: "gildan-64000",
      images: [
        { url: "https://cdn/64000_Black_01.jpg" }, // already present
        { url: "https://cdn/64000_Red_01.jpg" }, // new
      ],
    }
    const d = diffProduct({ desired, existing: baseExisting, supplierMetaKey: "gildan" })
    expect(d.imageUrlsToAdd).toEqual(["https://cdn/64000_Red_01.jpg"])
    // Images are NOT written via the workflow patch — they go through the safe
    // writeProductImages chokepoint. The diff exposes the full intended final
    // list (existing first, new appended) + the existing list for the writer.
    expect(d.topLevelPatch.images).toBeUndefined()
    expect(d.imageWrite?.desiredUrls).toEqual([
      "https://cdn/64000_Black_01.jpg",
      "https://cdn/64000_Red_01.jpg",
    ])
    expect(d.imageWrite?.currentUrls).toEqual([
      "https://cdn/64000_Black_01.jpg",
    ])
  })

  it("queues new SKUs for create and matches existing by SKU", () => {
    const desired: DesiredProduct = {
      handle: "gildan-64000",
      variants: [
        // existing SKU — no patch needed
        {
          sku: "64000-BLK-M",
          title: "Black / M",
          metadata: { gildan: { color: "Black" } },
          prices: [
            { amount: 10, currency_code: "aud", min_quantity: 1, max_quantity: 9 },
            { amount: 8, currency_code: "aud", min_quantity: 100 },
          ],
        },
        // new SKU — queue for create
        {
          sku: "64000-RED-L",
          title: "Red / L",
          options: { Colour: "Red", Size: "L" },
          metadata: { gildan: { color: "Red" } },
          prices: [
            { amount: 10, currency_code: "aud", min_quantity: 1, max_quantity: 9 },
          ],
        },
      ],
    }
    const d = diffProduct({ desired, existing: baseExisting, supplierMetaKey: "gildan" })
    expect(d.variantUpdates).toEqual([])
    expect(d.variantsToAdd.length).toBe(1)
    expect(d.variantsToAdd[0].sku).toBe("64000-RED-L")
    expect(d.variantsToAdd[0].product_id).toBe("prod_1")
    expect(d.variantsToAdd[0].options).toEqual({ Colour: "Red", Size: "L" })
  })

  it("detects price changes on existing variants and replaces the tier list", () => {
    const desired: DesiredProduct = {
      handle: "gildan-64000",
      variants: [
        {
          sku: "64000-BLK-M",
          prices: [
            { amount: 11, currency_code: "aud", min_quantity: 1, max_quantity: 9 },
            { amount: 9, currency_code: "aud", min_quantity: 100 },
          ],
        },
      ],
    }
    const d = diffProduct({ desired, existing: baseExisting, supplierMetaKey: "gildan" })
    expect(d.variantUpdates.length).toBe(1)
    expect(d.variantUpdates[0].id).toBe("var_1")
    expect(d.variantUpdates[0].prices).toEqual([
      { amount: 11, currency_code: "aud", min_quantity: 1, max_quantity: 9 },
      { amount: 9, currency_code: "aud", min_quantity: 100 },
    ])
  })

  it("does NOT touch variants that are in existing but missing from desired", () => {
    // Gildan removed the Black/L colour in a later spreadsheet; we keep
    // the row anyway so prior orders re-render.
    const existing: ExistingProductRow = {
      ...baseExisting,
      variants: [
        ...baseExisting.variants!,
        {
          id: "var_2",
          sku: "64000-BLK-L",
          title: "Black / L",
          prices: [
            { amount: 10, currency_code: "aud", min_quantity: 1, max_quantity: 9 },
          ],
        },
      ],
    }
    const desired: DesiredProduct = {
      handle: "gildan-64000",
      variants: [
        {
          sku: "64000-BLK-M",
          title: "Black / M",
          prices: [
            { amount: 10, currency_code: "aud", min_quantity: 1, max_quantity: 9 },
            { amount: 8, currency_code: "aud", min_quantity: 100 },
          ],
        },
      ],
    }
    const d = diffProduct({ desired, existing, supplierMetaKey: "gildan" })
    // No "delete" output, no patch for var_2.
    expect(d.variantUpdates.map((v) => v.id)).not.toContain("var_2")
    expect(d.variantsToAdd).toEqual([])
  })

  it("preserves staff metadata customisations on top-level merge", () => {
    const desired: DesiredProduct = {
      handle: "gildan-64000",
      metadata: {
        gildan: { code: "64000", last_sync: "2026-05-28" },
        // Importer never writes customizer.* but if it did, the existing
        // staff override should still win.
      },
    }
    const d = diffProduct({ desired, existing: baseExisting, supplierMetaKey: "gildan" })
    expect(d.topLevelPatch.metadata).toMatchObject({
      customizer: { print_area: { width: 30 } },
      gildan: { code: "64000", last_sync: "2026-05-28" },
    })
  })

  it("ignores undefined top-level fields (importer omitting them = no-op)", () => {
    // If the importer doesn't pass `material`, we shouldn't blank it out.
    const desired: DesiredProduct = {
      handle: "gildan-64000",
      // material not set
    }
    const d = diffProduct({ desired, existing: baseExisting, supplierMetaKey: "gildan" })
    expect(d.topLevelPatch.material).toBeUndefined()
  })

  it("distinguishes empty-string desired from undefined", () => {
    // Explicit "" means clear the field; undefined means leave alone.
    const desired: DesiredProduct = {
      handle: "gildan-64000",
      description: "",
    }
    const d = diffProduct({ desired, existing: baseExisting, supplierMetaKey: "gildan" })
    expect(d.topLevelPatch.description).toBe("")
  })
})

describe("supplier-product-sync — diffHasChanges", () => {
  it("returns false for a no-op diff", () => {
    expect(
      diffHasChanges({
        productId: "p",
        handle: "h",
        topLevelPatch: {},
        variantUpdates: [],
        variantsToAdd: [],
        imageUrlsToAdd: [],
        imageWrite: null,
        reasons: [],
      })
    ).toBe(false)
  })
  it("returns true for any non-empty patch", () => {
    expect(
      diffHasChanges({
        productId: "p",
        handle: "h",
        topLevelPatch: { title: "x" },
        variantUpdates: [],
        variantsToAdd: [],
        imageUrlsToAdd: [],
        imageWrite: null,
        reasons: [],
      })
    ).toBe(true)
  })
  it("returns true when only images/thumbnail changed", () => {
    expect(
      diffHasChanges({
        productId: "p",
        handle: "h",
        topLevelPatch: {},
        variantUpdates: [],
        variantsToAdd: [],
        imageUrlsToAdd: ["https://cdn/new.jpg"],
        imageWrite: {
          desiredUrls: ["https://cdn/new.jpg"],
          currentUrls: [],
          thumbnail: null,
        },
        reasons: ["+1 image(s)"],
      })
    ).toBe(true)
  })
})
