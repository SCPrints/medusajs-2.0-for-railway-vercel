/**
 * Lordicon Lottie JSON on the public CDN. Swap hashes from the library if you
 * change style; for production stability you can download JSON and host under /public.
 * @see https://lordicon.com/icons
 */
const CDN = "https://cdn.lordicon.com"

export const HOW_ORDER_LORDICON_URLS = [
  `${CDN}/jgnvfzqg.json`, // add card — choose product / basket
  `${CDN}/lupuorrc.json`, // confetti — colours & variety
  `${CDN}/nocovwne.json`, // document — artwork / upload
  `${CDN}/egmlnyku.json`, // consultation — proof & production support
  `${CDN}/rhvddzym.json`, // mail — delivered
  `${CDN}/lbjtvqiv.json`, // lock-unlock — pickup / hand-off
] as const

export const SERVICES_LORDICON_URLS: Record<
  | "Screen Print"
  | "Digital Transfer"
  | "Embroidery"
  | "Neck Tags"
  | "Fold & Bag"
  | "Warehousing & Fulfillment"
  | "UV Printing"
  | "Design",
  string
> = {
  "Screen Print": `${CDN}/fqbvgezn.json`,
  "Digital Transfer": `${CDN}/rhvddzym.json`,
  Embroidery: `${CDN}/exymduqj.json`,
  "Neck Tags": `${CDN}/yqzmiobz.json`,
  "Fold & Bag": `${CDN}/nocovwne.json`,
  "Warehousing & Fulfillment": `${CDN}/msoeawqm.json`,
  "UV Printing": `${CDN}/qhviklyi.json`,
  Design: `${CDN}/wxnxiano.json`,
}
