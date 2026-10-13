import { layoutOrbits } from "./orbit-layout"
import { RING_RADIUS } from "./style"
import type { GraphPayload } from "../../../types/graph"

const payload: GraphPayload = {
  mode: "summary",
  nodes: [
    { id: "root", kind: "root", label: "Catalog" },
    { id: "brand:A", kind: "brand", label: "A", productCount: 10 },
    { id: "brand:B", kind: "brand", label: "B", productCount: 5 },
    { id: "cat:top", kind: "category", label: "Mens", productCount: 3 },
    { id: "cat:sub", kind: "category", label: "Mens Tees", productCount: 3 },
    { id: "prod:1", kind: "product", label: "Tee", handle: "tee" },
    { id: "prod:2", kind: "product", label: "Hood", handle: "hood" },
  ],
  links: [
    { source: "brand:A", target: "root", kind: "brand-root" },
    { source: "brand:B", target: "root", kind: "brand-root" },
    { source: "cat:top", target: "root", kind: "category-root" },
    { source: "cat:sub", target: "cat:top", kind: "category-parent" },
    { source: "prod:1", target: "brand:A", kind: "product-brand" },
    { source: "prod:2", target: "brand:A", kind: "product-brand" },
    { source: "prod:1", target: "cat:top", kind: "product-category" },
  ],
}

describe("layoutOrbits", () => {
  it("puts the sun at the origin and planets on the brand ring", () => {
    const l = layoutOrbits(payload, null)
    expect(l.byId.get("root")).toMatchObject({ x: 0, y: 0 })
    for (const id of ["brand:A", "brand:B"]) {
      const p = l.byId.get(id)!
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(RING_RADIUS.brand!, 5)
    }
    expect(Math.hypot(l.byId.get("cat:top")!.x, l.byId.get("cat:top")!.y)).toBeCloseTo(RING_RADIUS.category!, 5)
  })

  it("hides products and sub-categories until their hub is selected, then orbits them", () => {
    expect(layoutOrbits(payload, null).byId.has("prod:1")).toBe(false)
    expect(layoutOrbits(payload, null).byId.has("cat:sub")).toBe(false)

    const l = layoutOrbits(payload, "brand:A")
    const hub = l.byId.get("brand:A")!
    for (const id of ["prod:1", "prod:2"]) {
      const p = l.byId.get(id)!
      expect(p.hubId).toBe("brand:A")
      expect(Math.hypot(p.x - hub.x, p.y - hub.y)).toBeGreaterThan(hub.r)
    }
    // prod:2 is not in cat:top, so selecting the category shows only prod:1
    const c = layoutOrbits(payload, "cat:top")
    expect(c.byId.has("prod:1")).toBe(true)
    expect(c.byId.has("prod:2")).toBe(false)
    expect(c.byId.get("cat:sub")!.hubId).toBe("cat:top")
  })

  it("is deterministic", () => {
    const a = layoutOrbits(payload, "brand:A").placed.map((p) => [p.node.id, p.x, p.y])
    const b = layoutOrbits(payload, "brand:A").placed.map((p) => [p.node.id, p.x, p.y])
    expect(a).toEqual(b)
  })
})
