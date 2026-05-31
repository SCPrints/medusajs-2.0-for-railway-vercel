import { mergeOrderMetadata } from "../order-metadata"

const buildContainer = (raw: jest.Mock) =>
  ({
    resolve: jest.fn((key: string) => {
      if (key === "__pg_connection__") return { raw }
      throw new Error(`unexpected resolve(${key})`)
    }),
  }) as any

describe("mergeOrderMetadata", () => {
  it("issues an atomic jsonb merge with the patch + order id bound", async () => {
    const raw = jest.fn(async () => ({ rows: [] }))
    await mergeOrderMetadata(buildContainer(raw), "order_123", {
      tax_exempt: true,
    })
    expect(raw).toHaveBeenCalledTimes(1)
    const [sql, bindings] = raw.mock.calls[0]
    const norm = String(sql).toLowerCase().replace(/\s+/g, " ")
    expect(norm).toContain('update "order"')
    expect(norm).toContain(
      "metadata = coalesce(metadata, '{}'::jsonb) || ?::jsonb"
    )
    expect(norm).toContain("where id = ?")
    // Patch serialised first, order id second — matches the two `?` placeholders.
    expect(bindings).toEqual([
      JSON.stringify({ tax_exempt: true }),
      "order_123",
    ])
  })

  it("no-ops (no DB write) on an empty patch or missing order id", async () => {
    const raw = jest.fn(async () => ({ rows: [] }))
    const c = buildContainer(raw)
    await mergeOrderMetadata(c, "order_1", {})
    await mergeOrderMetadata(c, "", { x: 1 })
    expect(raw).not.toHaveBeenCalled()
  })

  it("throws when the pg connection has no raw()", async () => {
    const c = { resolve: () => ({}) } as any
    await expect(
      mergeOrderMetadata(c, "order_1", { x: 1 })
    ).rejects.toThrow(/pg connection/)
  })
})
