import { supacolourMinimumMiddleware } from "../supacolour-minimum"

const line = (id: string, quantity: number) => ({
  id,
  quantity,
  metadata: {
    customizerDesign: {
      group_id: "g1",
      sideLayouts: [{ side: "front", objects: [{ src: "https://r2/logo.png" }] }],
      pricing: {
        server: { full_colour_card: "supacolour", print_side_keys: ["front"], print_size_id: "up_to_a4" },
      },
    },
  },
})

const run = async (items: unknown[] | null) => {
  const graph = jest.fn(async ({ entity }: { entity: string }) =>
    entity === "cart_payment_collection"
      ? { data: items ? [{ cart_id: "cart_1" }] : [] }
      : { data: [{ items }] }
  )
  const req = { params: { id: "pay_col_1" }, scope: { resolve: () => ({ graph }) } }
  const json = jest.fn()
  const res = { status: jest.fn(() => ({ json })) }
  const next = jest.fn()
  await supacolourMinimumMiddleware(req as never, res as never, next)
  return { status: res.status, next }
}

describe("supacolourMinimumMiddleware", () => {
  it("refuses a payment at 9 of a design", async () => {
    const { status, next } = await run([line("a", 4), line("b", 5)])
    expect(status).toHaveBeenCalledWith(409)
    expect(next).not.toHaveBeenCalled()
  })

  it("opens a payment at 10", async () => {
    const { status, next } = await run([line("a", 5), line("b", 5)])
    expect(status).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it("passes collections with no cart", async () => {
    const { next } = await run(null)
    expect(next).toHaveBeenCalled()
  })

  it("fails open when the lookup throws", async () => {
    const req = { params: { id: "x" }, scope: { resolve: () => { throw new Error("boom") } } }
    const next = jest.fn()
    jest.spyOn(console, "error").mockImplementationOnce(() => undefined)
    await supacolourMinimumMiddleware(req as never, {} as never, next)
    expect(next).toHaveBeenCalled()
  })
})
