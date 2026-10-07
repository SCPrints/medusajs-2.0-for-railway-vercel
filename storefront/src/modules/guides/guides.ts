/**
 * The one list of guides. The /guides index, the home page rail, the footer,
 * the HTML site map and sitemap.xml all read from here — add a guide once and
 * it shows up everywhere. A guide that is not in this list is invisible.
 * Ordered by how useful it is to someone who has not ordered before.
 */
export type GuideEntry = {
  slug: string
  title: string
  blurb: string
  tag: "Choosing a method" | "How it works" | "Brand guide" | "Artwork"
  /** Local image under /public. null = a swatch tile built from `tile`. */
  cover: string | null
  coverAlt: string
  /** Hex colours for the no-photo tile. */
  tile?: string[]
}

export const GUIDES: GuideEntry[] = [
  {
    slug: "dtf-vs-screen-printing-vs-embroidery",
    title: "DTF, screen printing or embroidery?",
    blurb: "How the three methods differ, where each one falls down, and a quick tool to pick the right one for your job.",
    tag: "Choosing a method",
    cover: "/images/services/embroidery/snip-society-scissors.png",
    coverAlt: "Detailed gold and silver embroidery on black fabric.",
  },
  {
    slug: "as-colour",
    title: "AS Colour: the range, explained",
    blurb: "Staple, Classic or Heavy? The tees and fleece by weight, every Staple Tee colour, and how to read the style names.",
    tag: "Brand guide",
    cover: "/images/brands/as-colour-banner.png",
    coverAlt: "Model wearing a pale blue AS Colour hood in an open landscape.",
  },
  {
    slug: "shaka-wear",
    title: "Shaka Wear Max Heavyweight",
    blurb: "The six cuts compared, what 7.5 oz means, garment dye explained, and a size chart for every style.",
    tag: "Brand guide",
    cover: "/images/brands/shaka-wear-hero-poster.jpg",
    coverAlt: "Still from the Shaka Wear brand film.",
  },
  {
    slug: "screen-printing-cost",
    title: "Why screen printing has setup costs",
    blurb: "What happens before the first print, why there is a minimum order, and how to keep the cost down.",
    tag: "How it works",
    cover: "/images/services/screen-printing/hitec-drainage-hivis.png",
    coverAlt: "Stack of hi-vis orange workwear with navy screen-printed branding.",
  },
  {
    slug: "cmyk-dtf",
    title: "CMYK guide for DTF printing",
    blurb: "Reference colour mixes and tips for preparing artwork that prints the way it looks on screen.",
    tag: "Artwork",
    cover: null,
    coverAlt: "",
    tile: ["#00aeef", "#ec008c", "#fff200", "#231f20"],
  },
  {
    slug: "pantone-screen-printing",
    title: "Pantone colours for screen printing",
    blurb: "How to supply a Pantone reference, what shifts the match on fabric, and the base inks and solids we are asked for most.",
    tag: "Artwork",
    cover: null,
    coverAlt: "",
    // Reflex Blue, 485, Yellow, 354, Purple — from the chart
    tile: ["#001689", "#E1261C", "#FFDE00", "#00AF43", "#C129B9"],
  },
]

export const guideHref = (g: Pick<GuideEntry, "slug">) => `/guides/${g.slug}`
