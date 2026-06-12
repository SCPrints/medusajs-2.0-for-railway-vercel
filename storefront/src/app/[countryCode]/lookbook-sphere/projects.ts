/**
 * Card payload for the spherical lookbook gallery.
 *
 * The live page maps real lookbook entries (admin-curated, via
 * `getLookbookPage`) into this shape server-side. The static list below is
 * only the FALLBACK for when the backend returns nothing (local dev without
 * a backend) — genuine past-job photos only, no product/blank shots.
 */
export type SphereProject = {
  id: string
  brand: string
  title: string
  /** Footer-left label. Empty string = omitted from the card. */
  category: string
  tags: string[]
  /** Empty string = omitted from the card. */
  year: string
  image: string
  blurb: string
}

export const FALLBACK_PROJECTS: SphereProject[] = [
  {
    id: "snip-society",
    brand: "Snip Society",
    title: "SCISSOR CLUB CAPS",
    category: "Embroidery",
    tags: ["Caps", "Small Biz"],
    year: "2025",
    image: "/images/services/embroidery/snip-society-scissors.png",
    blurb:
      "A barber collective wanted caps that read like merch, not uniforms. Tight 3D-puff scissors over a low-profile snapback, stitched in-house on the Tajima.",
  },
  {
    id: "gundam-polo",
    brand: "SC Prints",
    title: "GUNDAM MECHA POLO",
    category: "Embroidery",
    tags: ["Polos", "Anime"],
    year: "2026",
    image: "/images/services/embroidery/gundam-mecha-polo.png",
    blurb:
      "A 38k-stitch mecha chest hit on a performance polo. Digitised from line art, with a satin-stitch outline pass to keep the panel lines crisp at distance.",
  },
  {
    id: "anime-grid",
    brand: "SC Prints",
    title: "CHARACTER GRID SERIES",
    category: "Embroidery",
    tags: ["Hoodies", "Series"],
    year: "2026",
    image: "/images/services/embroidery/anime-character-grid.png",
    blurb:
      "Twelve character portraits, one hoodie each. A collector-style drop where every piece in the series shares a frame, a thread palette and a numbered tag.",
  },
  {
    id: "thread-wall",
    brand: "SC Prints",
    title: "THE THREAD WALL",
    category: "Studio",
    tags: ["Behind The Scenes"],
    year: "2024",
    image: "/images/services/embroidery/thread-colour-wall.jpg",
    blurb:
      "Six hundred cones of Madeira polyneon, racked by hue. The wall every embroidery colour-match starts at — and ends at, twenty minutes later.",
  },
  {
    id: "hitec-hivis",
    brand: "Hi-Tec Drainage",
    title: "HI-VIS CREW KIT",
    category: "Screen Print",
    tags: ["Hi-Vis", "Workwear"],
    year: "2025",
    image: "/images/services/screen-printing/hitec-drainage-hivis.png",
    blurb:
      "Day/night compliant hi-vis with a one-hit black print that survives the wash bay. Forty crew sized and bagged per ute, ready for Monday.",
  },
  {
    id: "eco-flush",
    brand: "Eco Flush Plumbing",
    title: "TRADE FLEET TEES",
    category: "Screen Print",
    tags: ["Workwear", "Fleet"],
    year: "2025",
    image: "/images/services/screen-printing/eco-flush-plumbing.png",
    blurb:
      "Front-left logo, full back map of the service area. Printed on a heavyweight workhorse tee that gets crawled through roof cavities and still holds.",
  },
  {
    id: "onpoint-kitchens",
    brand: "OnPoint Kitchens",
    title: "INSTALL TEAM UNIFORMS",
    category: "Screen Print",
    tags: ["Workwear", "Uniforms"],
    year: "2024",
    image: "/images/services/screen-printing/onpoint-kitchens.png",
    blurb:
      "Showroom-to-site uniforms for a kitchen installer — clean two-colour chest mark on charcoal so it photographs well in handover shots.",
  },
  {
    id: "restored-right",
    brand: "Restored Right",
    title: "RESTORATION CREW RUN",
    category: "Screen Print",
    tags: ["Tees", "Crew"],
    year: "2024",
    image: "/images/services/screen-printing/restored-right.png",
    blurb:
      "A restoration outfit's first proper merch run. Single-colour discharge print, soft hand, zero cracking — the brief was 'make it feel vintage on day one'.",
  },
]
