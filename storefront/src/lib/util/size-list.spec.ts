import {
  countSizes,
  matchColumns,
  normaliseSize,
  parseDelimited,
  parseSizeList,
  quantitiesForVariants,
  sizeKey,
  sizeRank,
} from "./size-list"

describe("parseDelimited", () => {
  it("reads tabs pasted from a spreadsheet", () => {
    expect(parseDelimited("Name\tSize\r\nJo Steele\tL\r\n\r\nAl\tM")).toEqual([
      ["Name", "Size"],
      ["Jo Steele", "L"],
      ["Al", "M"],
    ])
  })
  it("reads CSV with quoted commas and a BOM", () => {
    expect(parseDelimited('﻿name,unit\n"Steele, Jo","A ""Alpha"" Coy"')).toEqual([
      ["name", "unit"],
      ["Steele, Jo", 'A "Alpha" Coy'],
    ])
  })
})

describe("sizes", () => {
  it("treats spellings of the same size as one", () => {
    expect(sizeKey("X-Large")).toBe("xl")
    expect(sizeKey("XXL")).toBe(sizeKey("2XL"))
    expect(normaliseSize("medium")).toBe("M")
    expect(normaliseSize("One Size")).toBe("OSFA")
    expect(normaliseSize("S/M")).toBe("S/M")
    expect(normaliseSize("34")).toBe("34")
  })
  it("orders letters before numbers", () => {
    expect(["XL", "S", "12", "M", "OSFA", "3XL"].sort((a, b) => sizeRank(a) - sizeRank(b))).toEqual([
      "S", "M", "XL", "3XL", "12", "OSFA",
    ])
  })
})

describe("matchColumns", () => {
  it("matches headers in any order and spelling", () => {
    expect(matchColumns([["Shirt Size", "Jersey #", "Player", "Team"]])).toEqual({
      hasHeader: true,
      columns: ["size:tops", "number", "name", "unit"],
    })
    expect(matchColumns([["First Name", "Surname", "Size", "Pants size"]]).columns).toEqual([
      "first_name", "last_name", "size", "size:bottoms",
    ])
  })
  it("guesses from the cells when there is no header", () => {
    const { hasHeader, columns } = matchColumns([
      ["Jo Steele", "A Coy", "7", "L"],
      ["Al Brown", "B Coy", "12", "XL"],
      ["Di Wu", "A Coy", "3", "M"],
    ])
    expect(hasHeader).toBe(false)
    expect(columns).toEqual(["name", "unit", "number", "size"])
  })
})

describe("parseSizeList", () => {
  it("builds people and flags what needs checking", () => {
    const out = parseSizeList(
      ["Name,Team,No,Size", "Jo Steele,A,7,large", "Al Brown,B,,XXXXXXL", "jo steele,A,8,M", ",A,9,S", "Di Wu,B,4,"].join("\n"),
      { knownSizes: { tops: ["S", "M", "L", "XL", "2XL"] }, existingNames: ["Di Wu"] }
    )
    expect(out.hasHeader).toBe(true)
    expect(out.genericSize).toBe(true)
    expect(out.rows.map((r) => r.problems)).toEqual([
      [],
      ['Check size "XXXXXXL"'],
      ["Name already on the list"],
      ["No name"],
      ["Name already on the list", "No size"],
    ])
    expect(out.rows[0]).toMatchObject({ line: 2, name: "Jo Steele", unit: "A", number: "7", sizes: { tops: "L" } })
    expect(out.problemCount).toBe(4)
  })
  it("joins first + last name and keeps sizes per garment type", () => {
    const out = parseSizeList("First\tLast\tTop\tShorts\nJo\tSteele\tL\t34", {})
    expect(out.rows[0]).toMatchObject({ name: "Jo Steele", sizes: { tops: "L", bottoms: "34" }, problems: [] })
    expect(out.genericSize).toBe(false)
  })
  it("honours the buyer's own column choices", () => {
    const out = parseSizeList("L\tJo\nM\tAl", { columns: ["size", "name"] })
    expect(out.rows.map((r) => [r.name, r.sizes.tops])).toEqual([["Jo", "L"], ["Al", "M"]])
  })
})

describe("counting sizes into quantities", () => {
  const people = [
    { sizes: { tops: "L" } },
    { sizes: { tops: "l" } },
    { sizes: { tops: "XXL" } },
    { sizes: { tops: "6XL" } },
    { sizes: { bottoms: "34" } },
    { sizes: null },
  ]
  it("counts each size and who has none", () => {
    expect(countSizes(people, "tops")).toEqual({ counts: { l: 2, "2xl": 1, "6xl": 1 }, missing: 2 })
  })
  it("fills variants and reports sizes the garment lacks", () => {
    const { counts } = countSizes(people, "tops")
    expect(
      quantitiesForVariants(counts, [
        { id: "v_l", size: "L" },
        { id: "v_2xl", size: "2XL" },
      ])
    ).toEqual({ byVariant: { v_l: 2, v_2xl: 1 }, unmatched: [{ size: "6XL", count: 1 }] })
  })
})
