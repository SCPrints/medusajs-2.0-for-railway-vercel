import { loadFashionBizStockGroups } from "../fashionbiz-stock-groups"

const fbVariant = (sku: string, slug: string, colour: string) => ({
  sku,
  metadata: { fashionbiz: { product_slug: slug, color_name: colour } },
})

describe("loadFashionBizStockGroups (review 2-6)", () => {
  it("queries products per brand by handle prefix with stable ordering, and groups variants by (brand, slug, colour)", async () => {
    const calls: Array<Record<string, unknown>> = []
    const byPrefix: Record<string, unknown[]> = {
      "biz-collection-%": [
        {
          id: "p1",
          variants: [
            fbVariant("P400MS-NVY-S", "p400ms", "Navy"),
            fbVariant("P400MS-NVY-M", "p400ms", "Navy"),
            fbVariant("P400MS-RED-S", "p400ms", "Red"),
            { sku: "LEGACY-NO-META", metadata: null }, // spreadsheet-era row: skipped
          ],
        },
      ],
      "syzmik-%": [{ id: "p2", variants: [fbVariant("ZH236-YEL-L", "zh236", "Yellow")] }],
    }
    const query = {
      graph: async (q: Record<string, unknown>) => {
        calls.push(q)
        const like = (q.filters as { handle: { $like: string } }).handle.$like
        return { data: byPrefix[like] ?? [] }
      },
    }

    const { groups, variantCount } = await loadFashionBizStockGroups(query, { pageSize: 50 })

    expect(variantCount).toBe(4)
    expect([...groups.keys()].sort()).toEqual([
      "biz-collection|p400ms|Navy",
      "biz-collection|p400ms|Red",
      "syzmik|zh236|Yellow",
    ])
    expect([...groups.get("biz-collection|p400ms|Navy")!.skus]).toEqual(["P400MS-NVY-S", "P400MS-NVY-M"])

    // One call per brand (each page was short), scoped + ordered, variant fields only.
    expect(calls).toHaveLength(5)
    expect(calls[0]).toMatchObject({
      entity: "product",
      fields: ["id", "variants.sku", "variants.metadata"],
      filters: { handle: { $like: "biz-collection-%" } },
      pagination: { take: 50, skip: 0, order: { id: "ASC" } },
    })
  })

  it("walks pages until a short page", async () => {
    const skips: number[] = []
    const full = Array.from({ length: 2 }, (_, i) => ({
      id: `p${i}`,
      variants: [fbVariant(`SKU-${i}`, `slug-${i}`, "Black")],
    }))
    const query = {
      graph: async (q: Record<string, unknown>) => {
        const { skip } = q.pagination as { skip: number }
        const like = (q.filters as { handle: { $like: string } }).handle.$like
        if (like !== "biz-care-%") return { data: [] }
        skips.push(skip)
        return { data: skip === 0 ? full : [full[0]] }
      },
    }
    const { groups } = await loadFashionBizStockGroups(query, { pageSize: 2 })
    expect(skips).toEqual([0, 2])
    expect(groups.size).toBe(2)
  })
})
