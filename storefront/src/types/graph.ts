/**
 * Shared types for the product discovery graph.
 *
 * The backend at `backend/src/api/store/graph/route.ts` produces payloads matching
 * these shapes, and the storefront renders them with `react-force-graph-2d`.
 * Keep any shape changes in sync with the backend route.
 */

export type GraphMode = "summary" | "brand" | "category" | "all"

export type NodeKind = "root" | "brand" | "category" | "product"

export type GraphPrice = {
  amount: number
  currency_code: string
}

export type GraphNode = {
  /** Namespaced id — `root`, `brand:<name>`, `cat:<id>`, `prod:<id>`. */
  id: string
  kind: NodeKind
  label: string
  /** Product handle — used for click-to-navigate. */
  handle?: string
  /** Product thumbnail URL (may be null). */
  thumbnail?: string | null
  /** Lowest calculated variant price if available. */
  price?: GraphPrice | null
  /** Brand logo for richer rendering. */
  logoSrc?: string | null
  /**
   * Optional hint — e.g. product count behind a summary brand/category node.
   * Lets the client size super-nodes appropriately before expansion.
   */
  productCount?: number
}

export type GraphLinkKind =
  | "product-brand"
  | "product-category"
  | "category-parent"
  | "brand-root"
  | "category-root"

export type GraphLink = {
  source: string
  target: string
  kind: GraphLinkKind
}

export type GraphPayload = {
  nodes: GraphNode[]
  links: GraphLink[]
  mode: GraphMode
  /** Echoed back for pagination controls (brand/category modes). */
  offset?: number
  /** Total count on server for the current mode (used by "Load more"). */
  total?: number
}

export const GRAPH_NODE_ID = {
  root: () => "root",
  brand: (name: string) => `brand:${name}`,
  category: (id: string) => `cat:${id}`,
  product: (id: string) => `prod:${id}`,
} as const
