import {
  archiveLineDesigns,
  archiveSideLayoutsIfLarge,
  restoreSideLayouts,
} from "../side-layouts-archive"

const bigLayouts = [
  { side: "front", objects: [{ path: "M".repeat(300 * 1024) }] },
]
const smallLayouts = [{ side: "front", objects: [{ src: "https://r2/x.png" }] }]

function mockScope(urls: string[] = []) {
  let n = 0
  const createFiles = jest.fn(async (files: Array<{ filename: string }>) =>
    files.map(() => ({ url: urls[n++] ?? `https://r2/archive-${n}.json` }))
  )
  return { scope: { resolve: () => ({ createFiles }) }, createFiles }
}

describe("archiveSideLayoutsIfLarge", () => {
  it("leaves small designs inline", async () => {
    const { scope, createFiles } = mockScope()
    const design = { sideLayouts: smallLayouts }
    const out = await archiveSideLayoutsIfLarge(scope, design, "quote-q1")
    expect(out).toBe(design)
    expect(createFiles).not.toHaveBeenCalled()
  })

  it("archives large designs and strips inline layouts", async () => {
    const { scope } = mockScope(["https://r2/a.json"])
    const out = await archiveSideLayoutsIfLarge(
      scope,
      { sideLayouts: bigLayouts, artifacts: [] },
      "quote-q1"
    )
    expect(out.sideLayouts).toEqual([])
    expect(out.sideLayouts_archived_url).toBe("https://r2/a.json")
    expect(out.artifacts).toEqual([])
  })

  it("soft-fails to the inline design when upload throws", async () => {
    const scope = {
      resolve: () => ({
        createFiles: async () => {
          throw new Error("r2 down")
        },
      }),
    }
    const design = { sideLayouts: bigLayouts }
    const out = await archiveSideLayoutsIfLarge(scope, design, "quote-q1")
    expect(out).toBe(design)
  })
})

describe("archiveLineDesigns", () => {
  it("dedupes identical layouts across size lines to one upload", async () => {
    const { scope, createFiles } = mockScope(["https://r2/a.json"])
    const lines = [
      { customizerDesign: { sideLayouts: bigLayouts, variantId: "v1" } },
      { customizerDesign: { sideLayouts: bigLayouts, variantId: "v2" } },
      { customizerDesign: { sideLayouts: smallLayouts, variantId: "v3" } },
    ]
    await archiveLineDesigns(scope, lines, "quote-q1")
    expect(createFiles).toHaveBeenCalledTimes(1)
    expect(
      (lines[0].customizerDesign as any).sideLayouts_archived_url
    ).toBe("https://r2/a.json")
    expect(
      (lines[1].customizerDesign as any).sideLayouts_archived_url
    ).toBe("https://r2/a.json")
    expect((lines[1].customizerDesign as any).variantId).toBe("v2")
    expect((lines[2].customizerDesign as any).sideLayouts).toBe(smallLayouts)
  })
})

describe("restoreSideLayouts", () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
  })

  const fetchReturning = (body: unknown) =>
    (async () => ({ ok: true, json: async () => body })) as any

  it("re-inlines a raw-array archive", async () => {
    global.fetch = fetchReturning(bigLayouts)
    const out = await restoreSideLayouts({
      sideLayouts: [],
      sideLayouts_archived_url: "https://r2/a.json",
    })
    expect(out.sideLayouts).toEqual(bigLayouts)
  })

  it("re-inlines a wrapped { sideLayouts } archive (legacy one-off shape)", async () => {
    global.fetch = fetchReturning({ sideLayouts: bigLayouts })
    const out = await restoreSideLayouts({
      sideLayouts_archived_url: "https://r2/a.json",
    })
    expect(out.sideLayouts).toEqual(bigLayouts)
  })

  it("returns inline designs untouched without fetching", async () => {
    global.fetch = jest.fn() as any
    const design = { sideLayouts: smallLayouts }
    const out = await restoreSideLayouts(design)
    expect(out).toBe(design)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("soft-fails when the archive fetch errors", async () => {
    global.fetch = (async () => {
      throw new Error("net down")
    }) as any
    const design = { sideLayouts: [], sideLayouts_archived_url: "https://r2/a.json" }
    const out = await restoreSideLayouts(design)
    expect(out).toBe(design)
  })
})
