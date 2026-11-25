import { mergeMetadata } from "@medusajs/framework/utils"

import { metadataPatch } from "../metadata-patch"

describe("metadataPatch", () => {
  it("sends removed keys as empty strings and only the keys that changed", () => {
    const before = { po_document: { url: "x" }, po_number: "PO1", keep: 1, nested: { a: 1 } }
    const after = { po_number: "PO2", keep: 1, nested: { a: 1 } }
    expect(metadataPatch(before, after)).toEqual({ po_document: "", po_number: "PO2" })
  })

  it("merges to exactly the intended metadata", () => {
    const before = { a: 1, b: { nested: true }, c: "x" }
    const after = { a: 2, b: { nested: false }, d: [1] }
    expect(mergeMetadata(before, metadataPatch(before, after))).toEqual(after)
  })

  it("wipes everything for a fresh object, and copes with no metadata", () => {
    expect(mergeMetadata({ a: 1, b: 2 }, metadataPatch({ a: 1, b: 2 }, { stamped: "t" }))).toEqual({ stamped: "t" })
    expect(metadataPatch(null, { a: 1 })).toEqual({ a: 1 })
  })

  it("leaves a key someone else changed meanwhile alone", () => {
    const read = { production_stage: "received", is_stale: true }
    const now = { production_stage: "in_production", is_stale: true }
    const cleared = { production_stage: "received" }
    expect(mergeMetadata(now, metadataPatch(read, cleared))).toEqual({ production_stage: "in_production" })
  })
})
