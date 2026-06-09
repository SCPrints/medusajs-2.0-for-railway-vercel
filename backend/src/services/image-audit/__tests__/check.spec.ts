import {
  classifyProductImages,
  classifyThumbnail,
  shouldStamp,
  type UrlCheck,
} from "../check"

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

describe("classifyProductImages (thumbnail + gallery)", () => {
  const THUMB = "https://cdn/thumb.jpg"
  const FRONT = "https://cdn/black-front.jpg"
  const BACK = "https://cdn/black-back.jpg"
  const checks = (entries: Array<[string, UrlCheck]>) => new Map(entries)

  it("is ok when thumbnail and every gallery image are live", () => {
    expect(
      classifyProductImages(
        THUMB,
        [FRONT, BACK],
        checks([
          [THUMB, { ok: true, status: 200 }],
          [FRONT, { ok: true, status: 200 }],
          [BACK, { ok: true, status: 200 }],
        ])
      )
    ).toEqual({ status: "ok", broken_urls: [] })
  })

  it("is broken when a GALLERY image is dead even though the thumbnail is fine (the 2026-06-10 per-colour rot)", () => {
    const result = classifyProductImages(
      THUMB,
      [FRONT, BACK],
      checks([
        [THUMB, { ok: true, status: 200 }],
        [FRONT, { ok: false, status: 404 }],
        [BACK, { ok: true, status: 200 }],
      ])
    )
    expect(result.status).toBe("broken")
    expect(result.broken_urls).toEqual([FRONT])
  })

  it("is broken when only the thumbnail is dead", () => {
    const result = classifyProductImages(
      THUMB,
      [FRONT],
      checks([
        [THUMB, { ok: false, status: 410 }],
        [FRONT, { ok: true, status: 200 }],
      ])
    )
    expect(result.status).toBe("broken")
    expect(result.broken_urls).toEqual([THUMB])
  })

  it("collects every dead url, deduped against the thumbnail", () => {
    const result = classifyProductImages(
      FRONT, // thumbnail IS one of the gallery urls
      [FRONT, BACK],
      checks([
        [FRONT, { ok: false, status: 404 }],
        [BACK, { ok: false, status: 404 }],
      ])
    )
    expect(result.status).toBe("broken")
    expect(result.broken_urls).toEqual([FRONT, BACK])
  })

  it("keeps thumbnail-missing semantics when nothing is dead", () => {
    expect(
      classifyProductImages(
        "",
        [FRONT],
        checks([[FRONT, { ok: true, status: 200 }]])
      )
    ).toEqual({ status: "missing", broken_urls: [] })
    expect(classifyProductImages(null, [], checks([]))).toEqual({
      status: "missing",
      broken_urls: [],
    })
  })

  it("never flags unchecked urls (no check result = no verdict)", () => {
    expect(
      classifyProductImages(THUMB, [FRONT], checks([[THUMB, { ok: true, status: 200 }]]))
    ).toEqual({ status: "ok", broken_urls: [] })
  })

  it("ignores blank / null gallery entries", () => {
    expect(
      classifyProductImages(
        THUMB,
        ["", null, undefined, "   "],
        checks([[THUMB, { ok: true, status: 200 }]])
      )
    ).toEqual({ status: "ok", broken_urls: [] })
  })
})
