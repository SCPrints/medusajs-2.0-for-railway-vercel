/**
 * Shared types for the product discovery graph.
 *
 * The backend at `backend/src/api/store/graph/route.ts` produces payloads matching
 * these shapes, and the storefront renders them with `react-force-graph-2d`.
 * Keep any shape changes in sync with the backend route.
 */

export type GraphMode = "summary" | "brand" | "category" | "type" | "tag"

export type NodeKind = "root" | "brand" | "category" | "product" | "type" | "tag"

export type GraphNode = {
  /** Namespaced id — `root`, `brand:<name>`, `cat:<id>`, `prod:<id>`, `type:<id>`, `tag:<id>`. */
  id: string
  kind: NodeKind
  label: string
  /** Product handle (click-to-navigate) or brand/category handle (logo + link lookup). */
  handle?: string
  /** Product thumbnail URL (may be null). */
  thumbnail?: string | null
  /** Product count behind a summary hub node — sizes planets/moons before expansion. */
  productCount?: number
}

export type GraphLinkKind =
  | "product-brand"
  | "product-category"
  | "product-type"
  | "product-tag"
  | "category-parent"
  | "brand-root"
  | "category-root"
  | "type-root"
  | "tag-root"

export type GraphLink = {
  source: string
  target: string
  kind: GraphLinkKind
}

export type GraphPayload = {
  nodes: GraphNode[]
  links: GraphLink[]
  mode: GraphMode
  /** Echoed back for pagination controls (expansion modes). */
  offset?: number
  /** Total count on server for the current mode (used by "Load more"). */
  total?: number
}
