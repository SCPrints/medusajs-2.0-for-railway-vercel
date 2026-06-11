/**
 * Demo dataset for the spherical lookbook gallery. Images come from assets
 * already shipped in /public — swap for real lookbook entries when this
 * graduates from prototype to the live /lookbook experience.
 */
export type SphereProject = {
  id: string
  brand: string
  title: string
  category: string
  tags: string[]
  year: string
  image: string
  blurb: string
}

export const LOOKBOOK_PROJECTS: SphereProject[] = [
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
  {
    id: "ramo-oversize",
    brand: "Ramo",
    title: "OVERSIZE HOODIE DROP",
    category: "DTF",
    tags: ["Hoodies", "Streetwear"],
    year: "2026",
    image: "/images/brands/ramo/oversize-hoodie.jpg",
    blurb:
      "A boxy 420gsm blank carrying a full-colour DTF back piece. Gang-sheeted and pressed in-house, with a matte finish so the print sits flat in photos.",
  },
  {
    id: "ramo-kangaroo",
    brand: "Ramo",
    title: "KANGAROO POCKET SERIES",
    category: "DTF",
    tags: ["Hoodies"],
    year: "2025",
    image: "/images/brands/ramo/kangaroo-hoodie.jpg",
    blurb:
      "Pocket-aligned front prints are unforgiving — the artwork bridges the kangaroo pocket seam, so registration was checked garment-by-garment.",
  },
  {
    id: "gildan-hammer",
    brand: "Gildan",
    title: "HAMMER TEE MERCH",
    category: "Screen Print",
    tags: ["Merch", "Band"],
    year: "2025",
    image: "/images/brands/gildan/hammer-tee.jpg",
    blurb:
      "Tour merch on the Hammer — a heavyweight stage-ready tee. Two plastisol hits with a flash between, built to outlast the band's third reunion.",
  },
  {
    id: "comfort-colorblast",
    brand: "Comfort Colors",
    title: "COLORBLAST CAPSULE",
    category: "DTF",
    tags: ["Tees", "Capsule"],
    year: "2026",
    image: "/images/brands/comfort-colors/colorblast-tee.jpg",
    blurb:
      "Garment-dyed blanks with prints colour-matched to each dye lot. A small capsule where the shirt colour is half the design.",
  },
  {
    id: "aa-relaxed",
    brand: "American Apparel",
    title: "RELAXED TEE RANGE",
    category: "DTF",
    tags: ["Tees", "Retail"],
    year: "2025",
    image: "/images/brands/american-apparel/tee-relaxed.jpg",
    blurb:
      "A boutique's house-label range on relaxed-fit AA blanks. Neck-label prints replace the sewn tag — retail-ready straight off the press.",
  },
  {
    id: "ap-quarter-zip",
    brand: "Aussie Pacific",
    title: "QUARTER ZIP TEAMWEAR",
    category: "Embroidery",
    tags: ["Teamwear", "Club"],
    year: "2025",
    image: "/images/brands/aussie-pacific/quarter-zip.jpg",
    blurb:
      "Club quarter-zips with left-chest crests and sponsor sleeve hits. Sized from 6 to 5XL because a real club has every body in it.",
  },
  {
    id: "ramo-tote",
    brand: "Ramo",
    title: "EVENT TOTE RUN",
    category: "UV DTF",
    tags: ["Totes", "Events"],
    year: "2024",
    image: "/images/brands/ramo/tote-bag.jpg",
    blurb:
      "Five hundred conference totes, UV DTF so the gloss artwork pops against raw canvas. Packed in fifties and delivered to the venue dock.",
  },
  {
    id: "ascolour-club",
    brand: "AS Colour",
    title: "HEAVY TEE CLUB RUN",
    category: "Screen Print",
    tags: ["Tees", "Club"],
    year: "2025",
    image: "/images/brands/as-colour/ugc/ugc-1.png",
    blurb:
      "A run club's seasonal kit on the 5080 Heavy Tee. Puff-additive ink for the crest, flat ink for the back lockup — one garment, two textures.",
  },
]
