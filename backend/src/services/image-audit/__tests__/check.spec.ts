import { classifyThumbnail, shouldStamp } from "../check"

describe("classifyThumbnail", () => {
  it("treats empty / whitespace thumbnail as missing", () => {
    expect(classifyThumbnail("", { ok: true, status: 200 })).toBe("missing")
    expect(classifyThumbnail("   ", null)).toBe("missing")
    expect(classifyThumbnail(null, null)).toBe("missing")
    expect(classifyThumbnail(undefined, null)).toBe("missing")
  })

  it("treats a populated thumbnail with a passing check as ok", () => {
    expect(
      classifyThumbnail("https://cdn/x.jpg", { ok: true, status: 200 })
    ).toBe("ok")
  })

  it("treats a populated thumbnail with a failing check as broken", () => {
    expect(
      classifyThumbnail("https://cdn/x.jpg", { ok: false, status: 404 })
    ).toBe("broken")
    expect(
      classifyThumbnail("https://cdn/x.jpg", { ok: false, status: 0 })
    ).toBe("broken")
  })

  it("is missing (not broken) when a populated thumbnail was never checked", () => {
    // Defensive: a populated thumbnail should always come with a check,
    // but if it doesn't we must not flag it broken.
    expect(classifyThumbnail("https://cdn/x.jpg", null)).toBe("missing")
  })
})

describe("shouldStamp", () => {
  it("writes when a thumbnail becomes broken", () => {
    expect(shouldStamp("ok", "broken")).toBe(true)
    expect(shouldStamp("missing", "broken")).toBe(true)
    expect(shouldStamp(undefined, "broken")).toBe(true)
  })

  it("writes when a previously-broken thumbnail is fixed", () => {
    expect(shouldStamp("broken", "ok")).toBe(true)
    expect(shouldStamp("broken", "missing")).toBe(true)
  })

  it("does not write when broken-ness is unchanged", () => {
    expect(shouldStamp("broken", "broken")).toBe(false)
    expect(shouldStamp("ok", "ok")).toBe(false)
  })

  it("ignores ok↔missing churn so the healthy catalog is never rewritten", () => {
    // The whole point: first-run over thousands of healthy/empty products
    // must not trigger a write (and a product.updated reindex) for each.
    expect(shouldStamp(undefined, "ok")).toBe(false)
    expect(shouldStamp(undefined, "missing")).toBe(false)
    expect(shouldStamp("ok", "missing")).toBe(false)
    expect(shouldStamp("missing", "ok")).toBe(false)
  })
})
