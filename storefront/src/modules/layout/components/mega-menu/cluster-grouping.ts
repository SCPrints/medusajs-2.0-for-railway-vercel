import type { MenuSub } from "@lib/data/shop-categories-menu"

/**
 * Cluster grouping for the mega-menu dropdowns.
 *
 * The TREE in backend/src/lib/shop-categories.ts has implicit clusters (the
 * comment headers — "T-Shirts cluster", "Sweatshirts cluster", etc.) but
 * those aren't exported as data. This mirrors them as a flat membership
 * lookup so the menu dropdown can render columns grouped by garment type
 * regardless of audience.
 *
 * Each cluster declares its sub_handle members (not full handles — works
 * across audiences). Subs that fall outside every cluster bucket into
 * "Other" — keeps an audience-specific weirdness visible rather than
 * silently dropping it.
 */

export type Cluster = {
  name: string
  subs: MenuSub[]
}

type ClusterDef = {
  name: string
  members: Set<string>
}

const CLUSTERS: ClusterDef[] = [
  {
    name: "T-Shirts",
    members: new Set([
      "t-shirts",
      "long-sleeves",
      "pocket-tees",
      "active-tees",
      "v-necks",
      "hi-viz-t-shirts",
      "hi-viz-long-sleeves",
    ]),
  },
  {
    name: "Sweatshirts",
    members: new Set([
      "hoodies",
      "crewnecks",
      "quarter-zips",
      "zip-hoodies",
      "active-hoods",
      "hi-viz-hoodies",
      "hi-viz-crewnecks",
      "hi-viz-quarter-zips",
    ]),
  },
  {
    name: "Polos & Shirts",
    members: new Set([
      "polos",
      "active-polos",
      "business-shirts",
      "casual-shirts",
      "drill-shirts",
      "work-shirts",
      "hi-viz-polos",
      "hi-viz-drill-shirts",
      "hi-viz-business-shirts",
      "hi-viz-work-shirts",
    ]),
  },
  {
    name: "Jackets & Vests",
    members: new Set([
      "softshell-jackets",
      "rain-jackets",
      "puffer-jackets",
      "active-jackets",
      "insulated-jackets",
      "puffer-vests",
      "softshell-vests",
      "jackets",
      "vests",
      "hi-viz-softshell-jackets",
      "hi-viz-rain-jackets",
      "hi-viz-insulated-jackets",
      "hi-viz-puffer-vests",
      "hi-viz-softshell-vests",
    ]),
  },
  {
    name: "Pants & Shorts",
    members: new Set([
      "casual-pants",
      "casual-shorts",
      "track-pants",
      "active-shorts",
      "work-pants",
      "work-shorts",
      "rain-pants",
      "hi-viz-pants",
      "pants",
      "skirts",
      "scrub-pants",
    ]),
  },
  {
    name: "Tanks & Singlets",
    members: new Set([
      "tanks",
      "singlets",
      "active-singlets",
      "hi-viz-tanks",
      "hi-viz-singlets",
    ]),
  },
  {
    name: "Scrubs & Lab Coats",
    members: new Set(["scrub-tops", "tunics", "lab-coats", "cardigans"]),
  },
  {
    name: "Office",
    members: new Set(["knitwear", "blazers", "dresses"]),
  },
  {
    name: "Accessories",
    members: new Set([
      "headwear",
      "bags",
      "aprons",
      "socks",
      "drinkware",
      "stickers",
      "other",
    ]),
  },
  {
    name: "Spirits",
    members: new Set([
      "vodka",
      "gin",
      "whisky",
      "rum",
      "tequila",
      "cognac",
      "champagne",
      "liqueur",
      "mezcal",
    ]),
  },
]

/**
 * Bucket an audience's subs into clusters. Order of clusters in the output
 * matches CLUSTERS above (so the menu lays them out left-to-right in a
 * stable, expected order). Empty clusters are dropped.
 */
export function groupSubsByCluster(subs: MenuSub[]): Cluster[] {
  const buckets = new Map<string, MenuSub[]>()
  const orphans: MenuSub[] = []

  for (const sub of subs) {
    const cluster = CLUSTERS.find((c) => c.members.has(sub.sub_handle))
    if (!cluster) {
      orphans.push(sub)
      continue
    }
    const arr = buckets.get(cluster.name) ?? []
    arr.push(sub)
    buckets.set(cluster.name, arr)
  }

  const ordered: Cluster[] = []
  for (const def of CLUSTERS) {
    const items = buckets.get(def.name)
    if (items && items.length > 0) {
      ordered.push({ name: def.name, subs: items })
    }
  }
  if (orphans.length > 0) {
    ordered.push({ name: "More", subs: orphans })
  }
  return ordered
}
