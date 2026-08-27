import { buildFashionBizTable } from "../stamp-supplier-size-guides"

describe("buildFashionBizTable", () => {
  test("builds header from position-sorted sizes and one row per measurement", () => {
    const t = buildFashionBizTable([
      {
        measurement: "Garment ½ Chest (cm)",
        size_details: [
          { key: "M", value: "55", position: 2 },
          { key: "S", value: "52", position: 1 },
          { key: "L", value: "58", position: 3 },
        ],
      },
      {
        measurement: "Body Length (cm)",
        size_details: [
          { key: "S", value: "70", position: 1 },
          { key: "L", value: "74", position: 3 },
        ],
      },
    ])
    expect(t).toEqual({
      header: ["", "S", "M", "L"],
      rows: [
        ["Garment ½ Chest (cm)", "52", "55", "58"],
        ["Body Length (cm)", "70", "", "74"],
      ],
    })
  })

  test("returns null for empty/malformed charts", () => {
    expect(buildFashionBizTable([])).toBeNull()
    expect(buildFashionBizTable(undefined)).toBeNull()
    expect(buildFashionBizTable([{ measurement: 5, size_details: "x" }])).toBeNull()
  })
})
