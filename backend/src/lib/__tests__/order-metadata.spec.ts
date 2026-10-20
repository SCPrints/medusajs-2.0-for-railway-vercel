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

  it("unsets keys and appends to array keys in the same statement (review 3-5)", async () => {
    const raw = jest.fn(async () => ({ rows: [] }))
    const entry = { stage: "approved", changed_at: "2026-10-20T00:00:00Z" }
    await mergeOrderMetadata(
      buildContainer(raw),
      "order_1",
      { artwork_stage: "approved" },
      { unset: ["is_stale", "stale_since"], append: { production_stage_history: [entry] } }
    )
    const [sql, bindings] = raw.mock.calls[0]
    const norm = String(sql).replace(/\s+/g, " ")
    expect(norm).toContain(
      "jsonb_set((coalesce(metadata, '{}'::jsonb) - ?::text[]) || ?::jsonb, '{production_stage_history}', coalesce(metadata->'production_stage_history', '[]'::jsonb) || ?::jsonb)"
    )
    expect(bindings).toEqual([
      "{is_stale,stale_since}",
      JSON.stringify({ artwork_stage: "approved" }),
      JSON.stringify([entry]),
      "order_1",
    ])
  })

  it("ignores unsafe keys and empty appends; still no-ops when nothing to write", async () => {
    const raw = jest.fn(async () => ({ rows: [] }))
    await mergeOrderMetadata(buildContainer(raw), "order_1", {}, {
      unset: ["bad key'"],
      append: { "x; drop": [1], history: [] },
    })
    expect(raw).not.toHaveBeenCalled()
  })

  it("throws when the pg connection has no raw()", async () => {
    const c = { resolve: () => ({}) } as any
    await expect(
      mergeOrderMetadata(c, "order_1", { x: 1 })
    ).rejects.toThrow(/pg connection/)
  })
})
