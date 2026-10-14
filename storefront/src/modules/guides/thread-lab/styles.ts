/**
 * Editorial data for the Thread Lab guide. Facts that can change (colours,
 * sizes, photos, GSM) are read live from the products; only how each style
 * wears lives here. Keyed by product handle. A handle that isn't live on the
 * store is dropped by the page, so listing the Elevated range here early is
 * harmless — add it once those products are imported.
 */

export type ThreadLabStyle = {
  handle: string
  code: string
  name: string
  family: "tee" | "fleece"
  fitLabel: string
  fabric: string
  take: string
}

export const THREAD_LAB_STYLES: ThreadLabStyle[] = [
  {
    handle: "thread-lab-core-tee",
    code: "CTEE",
    name: "Core Tee",
    family: "tee",
    fitLabel: "Relaxed straight cut",
    fabric: "100% combed cotton",
    take: "The everyday blank. Mid weight, relaxed through the body, and the widest size run in the range.",
  },
  {
    handle: "thread-lab-superior-tee",
    code: "STEE",
    name: "Superior Tee",
    family: "tee",
    fitLabel: "Oversized",
    fabric: "100% combed cotton",
    take: "Heavier, with wide neck ribbing. Holds its shape wash after wash, so a print stays flat.",
  },
  {
    handle: "thread-lab-premium-tee",
    code: "PTEE",
    name: "Premium Tee",
    family: "tee",
    fitLabel: "Boxy, drop shoulder",
    fabric: "100% combed cotton",
    take: "The heaviest tee. 90s boxy frame, dropped shoulders and a big flat canvas for full-back artwork.",
  },
  {
    handle: "thread-lab-core-hoodie",
    code: "CHOODIE",
    name: "Core Hoodie",
    family: "fleece",
    fitLabel: "Relaxed, drop shoulder",
    fabric: "80% cotton, 20% polyester",
    take: "A preshrunk pullover with ribbed cuffs and waistband. The go-to for merch hoodies.",
  },
  {
    handle: "thread-lab-core-crew",
    code: "CCREW",
    name: "Core Crew",
    family: "fleece",
    fitLabel: "Relaxed, drop shoulder",
    fabric: "80% cotton, 20% polyester",
    take: "The hoodie's fabric as a crewneck. Clean chest for a left-chest logo or a big centre print.",
  },
]
