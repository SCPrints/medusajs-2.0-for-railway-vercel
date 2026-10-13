import type { GraphLink, GraphNode, GraphPayload } from "../../../types/graph"
import { RING_RADIUS, nodeRadius } from "./style"

/**
 * Deterministic "solar system" layout — pure maths, no simulation.
 *
 *   sun (root) at the origin
 *   planets (brands)            evenly spaced on RING_RADIUS.brand
 *   moons (top-level categories) evenly spaced on RING_RADIUS.category
 *   beacons (types) / stars (tags) on their own outer rings
 *   sub-categories of the SELECTED category on a small ring around it
 *   products of the SELECTED hub on concentric rings around that hub
 *
 * Positions depend only on the visible node set + selection, so the scene is
 * stable: nothing moves unless the user changes something, and CSS can tween
 * between two layouts.
 */

export type Placed = {
  node: GraphNode
  x: number
  y: number
  /** World radius of the body. */
  r: number
  /** Id of the hub this body orbits (products / sub-categories), else null. */
  hubId: string | null
}

export type OrbitLayout = {
  placed: Placed[]
  byId: Map<string, Placed>
  /** Ring radii actually in use (for drawing orbit circles). */
  rings: number[]
  /** Outer extent of the layout, for fit-to-view. */
  extent: number
}

const PRODUCT_SPACING = 30
const PRODUCT_R = 11
const SUB_CATEGORY_R = 5
const SUB_RING_GAP = 48

/** 2-decimal rounding so server and client serialise identical inline styles (hydration). */
const round = (v: number) => Math.round(v * 100) / 100

export function linkEndId(value: unknown): string {
  if (typeof value === "string") return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === "string" ? id : ""
}

function placeOnRing(nodes: GraphNode[], ring: number, out: Placed[], byId: Map<string, Placed>) {
  const n = nodes.length
  nodes.forEach((node, i) => {
    // Start at the top and go clockwise; a half-step offset keeps the first
    // body off the vertical axis so labels don't stack on the sun's label.
    const a = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2
    const placed: Placed = {
      node,
      x: round(Math.cos(a) * ring),
      y: round(Math.sin(a) * ring),
      r: round(nodeRadius(node.kind, node.productCount)),
      hubId: null,
    }
    out.push(placed)
    byId.set(node.id, placed)
  })
}

/** Concentric rings of satellites around a hub, filling each ring before starting the next. */
function placeSatellites(
  satellites: GraphNode[],
  hub: Placed,
  firstRing: number,
  r: number,
  out: Placed[],
  byId: Map<string, Placed>
) {
  let ring = firstRing
  let i = 0
  while (i < satellites.length) {
    const capacity = Math.max(6, Math.floor((2 * Math.PI * ring) / PRODUCT_SPACING))
    const batch = satellites.slice(i, i + capacity)
    batch.forEach((node, j) => {
      const a = -Math.PI / 2 + (j / batch.length) * Math.PI * 2
      const placed: Placed = {
        node,
        x: round(hub.x + Math.cos(a) * ring),
        y: round(hub.y + Math.sin(a) * ring),
        r,
        hubId: hub.node.id,
      }
      out.push(placed)
      byId.set(node.id, placed)
    })
    i += batch.length
    ring += PRODUCT_SPACING
  }
}

export function layoutOrbits(payload: GraphPayload, selectedId: string | null): OrbitLayout {
  const placed: Placed[] = []
  const byId = new Map<string, Placed>()
  const rings: number[] = []

  const parentOf = new Map<string, string>()
  const hubsOf = new Map<string, string[]>()
  for (const l of payload.links as GraphLink[]) {
    const s = linkEndId(l.source)
    const t = linkEndId(l.target)
    if (l.kind === "category-parent") parentOf.set(s, t)
    else if (l.kind.startsWith("product-")) {
      if (!hubsOf.has(s)) hubsOf.set(s, [])
      hubsOf.get(s)!.push(t)
    }
  }

  // Alphabetical, NOT by product count: counts change when an expansion
  // merges in, and re-ordering a ring would move every planet under the user.
  const byKind = (kind: GraphNode["kind"]) =>
    payload.nodes.filter((n) => n.kind === kind).sort((a, b) => a.label.localeCompare(b.label))

  const root = payload.nodes.find((n) => n.kind === "root")
  if (root) {
    const p: Placed = { node: root, x: 0, y: 0, r: round(nodeRadius("root")), hubId: null }
    placed.push(p)
    byId.set(root.id, p)
  }

  const brands = byKind("brand")
  const topCategories = byKind("category").filter((n) => !parentOf.has(n.id))
  const types = byKind("type")
  const tags = byKind("tag")

  for (const [nodes, ring] of [
    [brands, RING_RADIUS.brand!],
    [topCategories, RING_RADIUS.category!],
    [types, RING_RADIUS.type!],
    [tags, RING_RADIUS.tag!],
  ] as const) {
    if (!nodes.length) continue
    placeOnRing(nodes, ring, placed, byId)
    rings.push(ring)
  }

  const hub = selectedId ? byId.get(selectedId) : undefined
  if (hub) {
    const subCategories = payload.nodes.filter(
      (n) => n.kind === "category" && parentOf.get(n.id) === hub.node.id
    )
    if (subCategories.length) {
      placeSatellites(subCategories, hub, hub.r + SUB_RING_GAP, SUB_CATEGORY_R, placed, byId)
    }
    const products = payload.nodes.filter(
      (n) => n.kind === "product" && hubsOf.get(n.id)?.includes(hub.node.id)
    )
    if (products.length) {
      placeSatellites(products, hub, hub.r + SUB_RING_GAP + (subCategories.length ? PRODUCT_SPACING : 0), PRODUCT_R, placed, byId)
    }
  }

  const extent = placed.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y) + p.r), 0)
  return { placed, byId, rings, extent }
}
