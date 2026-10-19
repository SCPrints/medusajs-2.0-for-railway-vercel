"use client"

// One lazy entry for every Halloween decoration. Importing them through this
// file (rather than three separate dynamic imports) keeps art.tsx — the bulk
// of the theme — in ONE shared chunk instead of being inlined three times.
export { default as HalloweenHeroArt } from "./hero-art"
export { default as HalloweenSiteDecor } from "./site-decor"
export { default as HalloweenCtaMascot } from "./cta-mascot"
