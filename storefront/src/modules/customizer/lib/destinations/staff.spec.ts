import { sendPoaRequest, sendToPos, sendToQuote } from "./staff"

const IMG = `data:image/png;base64,${"A".repeat(400)}`
const metadataBase: any = {
  version: 2,
  type: "fabric_customizer",
  productId: "prod_1",
  sideLayouts: [{ side: "front", objects: [{ type: "Image", src: IMG }] }],
  artifacts: [{ side: "front", printUrl: "https://r2/p.png", mockupUrl: "https://r2/m.jpg" }],
  printArea: { x: 1, y: 1, width: 1, height: 1 },
  sizes: [],
  pricing: {},
}
const common = {
  cells: [
    { variant: { id: "var_M", title: "Black / M", calculated_price: { calculated_amount: 38.1 } }, size: "M", quantity: 2 },
    { variant: { id: "var_L", title: "Black / L", calculated_price: { calculated_amount: 38.1 } }, size: "L", quantity: 3 },
  ],
  metadataBase,
  hostedByDataUrl: { [IMG]: "https://r2/original.png" },
  product: { id: "prod_1", handle: "classic-tee", title: "Classic Tee" },
  printSizeId: "up_to_a4",
}

const calls: Array<{ url: string; body: any; headers: any }> = []
let respond: (url: string) => Response | Promise<Response> = () => new Response("{}", { status: 200 })

beforeEach(() => {
  calls.length = 0
  respond = () => new Response("{}", { status: 200 })
  ;(global as any).fetch = jest.fn(async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers })
    return respond(url)
  })
})

describe("sendToPos", () => {
  it("posts one line per size with its own design and the garment price in cents", async () => {
    await sendToPos({ ...common, sessionId: "pos_1" })
    expect(calls.map((c) => c.url)).toEqual(["/api/pos-bridge/items", "/api/pos-bridge/items"])
    expect(calls[0].body).toMatchObject({
      pos_session_id: "pos_1",
      kind: "customizer",
      variant_id: "var_M",
      variant_title: "Black / M",
      quantity: 2,
      unit_price_cents: 3810,
      metadata: { product_handle: "classic-tee", print_size_id: "up_to_a4" },
    })
    expect(calls[1].body.metadata.customizerDesign.variantId).toBe("var_L")
    expect(calls[0].body.metadata.customizerDesign.sideLayouts[0].objects[0].src).toBe("https://r2/original.png")
  })

  it("surfaces the bridge error", async () => {
    respond = () => new Response(JSON.stringify({ error: "session expired" }), { status: 410 })
    await expect(sendToPos({ ...common, sessionId: "pos_1" })).rejects.toThrow("session expired")
  })
})

describe("sendToQuote", () => {
  it("sends every size in ONE request, design once, decorated dollars converted to cents", async () => {
    await sendToQuote({ ...common, quoteId: "qt_1", qsig: "sig", groupId: "gs_1", decoratedUnitDollars: 67.6, backendUrl: "https://api.x/", publishableKey: "pk_1" })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://api.x/store/quotes/qt_1/design-items")
    expect(calls[0].headers["x-publishable-api-key"]).toBe("pk_1")
    const body = calls[0].body
    expect(body).toMatchObject({ quote_id: "qt_1", qsig: "sig", group_id: "gs_1" })
    expect(body.design.sideLayouts[0].objects[0].src).toBe("https://r2/original.png")
    expect(body.lines.map((l: any) => [l.variant_id, l.quantity, l.unit_price_cents])).toEqual([
      ["var_M", 2, 6760],
      ["var_L", 3, 6760],
    ])
    expect(body.lines[0].metadata).not.toHaveProperty("customizerDesign")
  })

  it("falls back to the garment price and to the relay when the backend is unreachable", async () => {
    respond = (url) => {
      if (url.startsWith("https://")) throw new TypeError("Failed to fetch")
      return new Response("{}", { status: 200 })
    }
    await sendToQuote({ ...common, quoteId: "qt_1", qsig: "sig", backendUrl: "https://api.x" })
    expect(calls.map((c) => c.url)).toEqual(["https://api.x/store/quotes/qt_1/design-items", "/api/quote-bridge/items"])
    expect(calls[1].body.group_id).toMatch(/^qg_/)
    expect(calls[1].body.lines[0].unit_price_cents).toBe(3810)
  })
})

describe("sendPoaRequest", () => {
  it("sends the design with no prices and returns the quote reference", async () => {
    respond = () => new Response(JSON.stringify({ public_id: "Q-ABC" }), { status: 201 })
    const r = await sendPoaRequest({
      ...common,
      contact: { email: "a@b.co", phone: "0400 000 000", name: "", note: "Thread match" },
      poaSides: [{ side: "front", stitch_count: 20000 }],
    })
    expect(r).toEqual({ publicId: "Q-ABC" })
    const body = calls[0].body
    expect(calls[0].url).toBe("/api/quote-bridge/poa")
    expect(body).toMatchObject({ email: "a@b.co", contact_phone: "0400 000 000", note: "Thread match", poa_sides: [{ side: "front", stitch_count: 20000 }] })
    expect(body).not.toHaveProperty("contact_name")
    expect(body.lines.every((l: any) => l.unit_price_cents === null && l.metadata.customizerDesign)).toBe(true)
  })
})
