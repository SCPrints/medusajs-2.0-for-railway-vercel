jest.mock("@lib/data/cart", () => ({
  addScpLineItemToCartSafe: jest.fn(async () => ({ ok: true })),
  addScpLineItemsBatchSafe: jest.fn(async () => ({ ok: true })),
  deleteLineItem: jest.fn(async (id: string) => {
    if (id === "bad") throw new Error("nope")
  }),
}))

import { addScpLineItemsBatchSafe, addScpLineItemToCartSafe } from "@lib/data/cart"

import { addCartBatch, buildCartBatchItems, removeReplacedLines } from "./cart"

const IMG = `data:image/png;base64,${"A".repeat(400)}`

const metadataBase: any = {
  version: 2,
  type: "fabric_customizer",
  productId: "prod_1",
  sideLayouts: [{ side: "front", objects: [{ type: "Image", src: IMG }] }],
  artifacts: [
    { side: "front", printUrl: "https://r2/p-front.png", mockupUrl: "https://r2/m-front.jpg" },
    { side: "back", printUrl: "https://r2/p-back.png", mockupUrl: "https://r2/m-back.jpg" },
  ],
  printArea: { x: 1, y: 1, width: 1, height: 1 },
  sizes: [],
  pricing: {},
}

describe("buildCartBatchItems", () => {
  it("makes one line per cell with the full design, hosted images and display fields", () => {
    const [line] = buildCartBatchItems({
      cells: [{ variant: { id: "var_L" }, quantity: 3 }],
      metadataBase,
      hostedByDataUrl: { [IMG]: "https://r2/original.png" },
      printSizeId: "up_to_a4",
      designId: "design_9",
      product: { handle: "classic-tee", title: "Classic Tee" },
    })
    const design = line.metadata.customizerDesign as any
    expect(line).toMatchObject({ variantId: "var_L", quantity: 3, printSizeId: "up_to_a4" })
    expect(design.variantId).toBe("var_L")
    expect(design.sideLayouts[0].objects[0].src).toBe("https://r2/original.png")
    expect(line.metadata).toMatchObject({
      source_design_id: "design_9",
      designId: "design_9",
      product_handle: "classic-tee",
      product_title: "Classic Tee",
    })
  })

  it("swaps in bulk-grid colour mockups only for the sides that have one", () => {
    const [line] = buildCartBatchItems({
      cells: [{ variant: { id: "var_red" }, quantity: 1, mockupDataUrlsBySide: { back: "data:image/jpeg;base64,BBBB" } }],
      metadataBase,
      hostedByDataUrl: {},
      printSizeId: "up_to_a4",
      product: {},
    })
    const artifacts = (line.metadata.customizerDesign as any).artifacts
    expect(artifacts.find((a: any) => a.side === "front").mockupUrl).toBe("https://r2/m-front.jpg")
    expect(artifacts.find((a: any) => a.side === "back").mockupUrl).toBe("data:image/jpeg;base64,BBBB")
    expect(line.metadata).not.toHaveProperty("source_design_id")
  })
})

describe("addCartBatch", () => {
  beforeEach(() => jest.clearAllMocks())

  it("sends one line through the single-line endpoint and many as one batch", async () => {
    const item = { variantId: "v", quantity: 1, printSizeId: "up_to_a6" as const, metadata: {} }
    await addCartBatch([item], "au")
    expect(addScpLineItemToCartSafe).toHaveBeenCalledTimes(1)
    await addCartBatch([item, item, item], "au")
    expect(addScpLineItemsBatchSafe).toHaveBeenCalledTimes(1)
  })

  it("throws the server's message", async () => {
    ;(addScpLineItemToCartSafe as jest.Mock).mockResolvedValueOnce({ ok: false, error: "Out of stock" })
    await expect(
      addCartBatch([{ variantId: "v", quantity: 1, printSizeId: "up_to_a6", metadata: {} }], "au")
    ).rejects.toThrow("Out of stock")
  })
})

describe("removeReplacedLines", () => {
  it("prefers the edited group, then siblings, then the single edited line", async () => {
    expect(await removeReplacedLines({ editGroupId: "g", editGroupLineIds: ["a", "b"], siblingLineIds: ["c"], editLineItemId: "d" })).toEqual({ attempted: 2, failed: [] })
    expect(await removeReplacedLines({ editGroupLineIds: [], siblingLineIds: ["c", "bad"], editLineItemId: "d" })).toEqual({ attempted: 2, failed: ["bad"] })
    expect(await removeReplacedLines({ editGroupLineIds: [], siblingLineIds: [], editLineItemId: "d" })).toEqual({ attempted: 1, failed: [] })
  })
})
