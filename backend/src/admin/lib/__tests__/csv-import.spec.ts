import { parseCsv } from "../csv-import"

describe("csv-import", () => {
  it("parses well-formed CSV with no empty headers", () => {
    const parsed = parseCsv("a,b,c\n1,2,3\n4,5,6")
    expect(parsed.headers).toEqual(["a", "b", "c"])
    expect(parsed.rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ])
    expect(parsed.emptyHeaderColumns).toEqual([])
  })

  it("preserves column alignment when a header cell is blank", () => {
    const parsed = parseCsv("a,,c\n1,2,3")
    expect(parsed.headers).toEqual(["a", "", "c"])
    expect(parsed.rows[0]).toEqual({ a: "1", "": "2", c: "3" })
    expect(parsed.emptyHeaderColumns).toEqual([2])
  })

  it("flags multiple blank-header columns", () => {
    const parsed = parseCsv("a,,c,\n1,2,3,4")
    expect(parsed.emptyHeaderColumns).toEqual([2, 4])
    expect(parsed.rows[0]?.a).toBe("1")
    expect(parsed.rows[0]?.c).toBe("3")
  })

  it("returns an empty result for an empty input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [], emptyHeaderColumns: [] })
  })

  it("strips a UTF-8 BOM from the first header", () => {
    const parsed = parseCsv("﻿a,b\n1,2")
    expect(parsed.headers).toEqual(["a", "b"])
    expect(parsed.rows[0]).toEqual({ a: "1", b: "2" })
    expect(parsed.emptyHeaderColumns).toEqual([])
  })
})
