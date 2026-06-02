import { planImageWrite, imageKey, type Liveness } from "../safe-product-images"

const L = (entries: Record<string, Liveness>): Map<string, Liveness> => {
  const m = new Map<string, Liveness>()
  for (const [url, status] of Object.entries(entries)) m.set(imageKey(url), status)
  return m
}

const A = "https://cdn.example.com/a.jpg"
const B = "https://cdn.example.com/b.jpg"
const C = "https://cdn.example.com/c.jpg"

describe("planImageWrite — the never-wipe guard", () => {
  test("adds a confirmed-live image", () => {
    const p = planImageWrite([A], [A, B], L({ [B]: "live" }), { allowRepairRemovals: false })
    expect(p.final).toEqual([A, B])
    expect(p.added).toEqual([B])
    expect(p.rejected).toEqual([])
  })

  test("rejects a DEAD addition (never writes a 404 url)", () => {
    const p = planImageWrite([A], [A, B], L({ [B]: "dead" }), { allowRepairRemovals: false })
    expect(p.final).toEqual([A])
    expect(p.added).toEqual([])
    expect(p.rejected).toEqual([{ url: B, reason: "dead (404/410)" }])
  })

  test("rejects an UNVERIFIED addition (never writes an unchecked url)", () => {
    const p = planImageWrite([A], [A, B], L({ [B]: "unknown" }), { allowRepairRemovals: false })
    expect(p.final).toEqual([A])
    expect(p.rejected).toEqual([{ url: B, reason: "unverified" }])
  })

  test("APPEND-ONLY: omitting a live current image does NOT remove it", () => {
    const p = planImageWrite([A, B], [A], L({ [B]: "live" }), { allowRepairRemovals: false })
    expect(p.final).toEqual([A, B])
    expect(p.removed).toEqual([])
    expect(p.forceKept).toEqual([B])
  })

  test("APPEND-ONLY: a wholesale-replace attempt cannot wipe — live images survive", () => {
    // Caller tries to replace [A,B] with a single new url C.
    const p = planImageWrite([A, B], [C], L({ [A]: "live", [B]: "live", [C]: "live" }), {
      allowRepairRemovals: false,
    })
    expect(p.final).toEqual([A, B, C]) // A, B protected; C added
    expect(p.removed).toEqual([])
    expect(p.forceKept).toEqual([A, B])
    expect(p.added).toEqual([C])
  })

  test("REPAIR: removes a confirmed-dead image when explicitly allowed", () => {
    const p = planImageWrite([A, B], [A], L({ [B]: "dead" }), { allowRepairRemovals: true })
    expect(p.final).toEqual([A])
    expect(p.removed).toEqual([B])
    expect(p.forceKept).toEqual([])
  })

  test("REPAIR: still will NOT remove a live image even if the caller omits it", () => {
    const p = planImageWrite([A, B], [A], L({ [B]: "live" }), { allowRepairRemovals: true })
    expect(p.final).toEqual([A, B])
    expect(p.removed).toEqual([])
    expect(p.forceKept).toEqual([B])
  })

  test("REPAIR: will NOT remove an UNKNOWN/transient image (only confirmed-dead)", () => {
    const p = planImageWrite([A, B], [A], L({ [B]: "unknown" }), { allowRepairRemovals: true })
    expect(p.final).toEqual([A, B])
    expect(p.forceKept).toEqual([B])
  })

  test("dedupes by normalised key (query string / case ignored)", () => {
    const p = planImageWrite([A], [A, A + "?c=1"], L({}), { allowRepairRemovals: false })
    expect(p.final).toEqual([A])
    expect(p.added).toEqual([])
  })

  test("repair that drops every image leaves final empty — caller must abort (never write [])", () => {
    // All current dead, nothing to add → final is empty; writeProductImages aborts on this.
    const p = planImageWrite([A, B], [], L({ [A]: "dead", [B]: "dead" }), {
      allowRepairRemovals: true,
    })
    expect(p.final).toEqual([])
  })

  test("repair keeps a live image even when every OTHER image is dead", () => {
    const p = planImageWrite([A, B, C], [], L({ [A]: "dead", [B]: "live", [C]: "dead" }), {
      allowRepairRemovals: true,
    })
    expect(p.final).toEqual([B])
    expect(p.removed.sort()).toEqual([A, C].sort())
    expect(p.forceKept).toEqual([B])
  })
})
