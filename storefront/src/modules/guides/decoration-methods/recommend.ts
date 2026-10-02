/**
 * Rule-of-thumb method picker for the "DTF vs screen printing vs embroidery"
 * guide. It ranks the three methods for a job; it never prices anything —
 * the customiser does that.
 *
 * Hard rules come from how the shop actually runs: the screen-print minimum
 * (SCREEN_MIN_QUANTITY), embroidery-only beanies and puffer jackets (print
 * profiles), solid colours only on screens, no photos in thread. Everything
 * else is a weighting, tuned against the scenarios in recommend.spec.ts.
 */
import { SCREEN_MIN_QUANTITY } from "@modules/customizer/lib/scp-screen-print-pricing"

export type Method = "dtf" | "screen" | "embroidery"
export type Quantity = "small" | "medium" | "large"
export type Artwork = "photo" | "solid" | "logo"
export type Garment = "tee" | "polo" | "headwear" | "jacket"

export type Answers = { quantity: Quantity; artwork: Artwork; garment: Garment }

export type Verdict = "best" | "works" | "avoid"
export type Ranked = { method: Method; verdict: Verdict; reasons: string[] }

export const QUANTITY_LABEL: Record<Quantity, string> = {
  small: `Under ${SCREEN_MIN_QUANTITY}`,
  medium: `${SCREEN_MIN_QUANTITY} to 99`,
  large: "100 or more",
}
export const ARTWORK_LABEL: Record<Artwork, string> = {
  photo: "Photo, gradients or lots of colours",
  solid: "A graphic in 1 to 3 solid colours",
  logo: "A small logo or text",
}
export const GARMENT_LABEL: Record<Garment, string> = {
  tee: "Tees, hoodies, totes",
  polo: "Polos, workwear, business shirts",
  headwear: "Caps and beanies",
  jacket: "Jackets and puffers",
}

type Scored = { method: Method; score: number; blocked: boolean; reasons: string[] }

function scoreDtf({ quantity, artwork, garment }: Answers): Scored {
  let score = 0
  const reasons: string[] = []
  if (artwork === "photo") {
    score += 4
    reasons.push("The only one of the three that prints photos and gradients.")
  } else {
    score += artwork === "logo" ? 2 : 1
  }
  if (quantity === "small") {
    score += 3
    reasons.push("No minimum, so it suits a small run.")
  } else if (quantity === "medium") {
    score += 1
  } else {
    reasons.push("The cost per piece barely falls on a big run.")
  }
  if (garment === "tee") score += 1
  if (garment === "headwear") {
    score -= 2
    reasons.push("Works on caps at small sizes only, and not on beanies.")
  }
  if (garment === "jacket") {
    score -= 2
    reasons.push("Heat-pressed transfers cannot go on puffer jackets and do not suit every shell fabric.")
  }
  return { method: "dtf", score, blocked: false, reasons }
}

function scoreScreen({ quantity, artwork, garment }: Answers): Scored {
  const blockers: string[] = []
  if (quantity === "small") blockers.push(`Screen printing starts at ${SCREEN_MIN_QUANTITY} pieces.`)
  if (artwork === "photo") blockers.push("Screens print solid colours, so photos and gradients are out.")
  if (garment === "headwear" || garment === "jacket")
    blockers.push("Best kept to flat garments like tees, hoodies and totes.")
  if (blockers.length) return { method: "screen", score: -99, blocked: true, reasons: blockers }

  let score = 1
  const reasons: string[] = []
  if (quantity === "large") {
    score += 3
    reasons.push("On a run this size it has the lowest cost per piece.")
  } else {
    reasons.push("At this quantity it can go either way against DTF. Compare both in the customiser.")
  }
  if (artwork === "solid") {
    score += 2
    reasons.push("Bold solid colours are what it does best, with a soft, light feel.")
  }
  if (garment === "tee") score += 2
  return { method: "screen", score, blocked: false, reasons }
}

function scoreEmbroidery({ quantity, artwork, garment }: Answers): Scored {
  if (artwork === "photo")
    return {
      method: "embroidery",
      score: -99,
      blocked: true,
      reasons: ["Thread cannot reproduce photos or gradients."],
    }

  let score = 0
  const reasons: string[] = []
  if (garment === "headwear") {
    score += 4
    reasons.push("The standard on caps, and the only option on beanies.")
  } else if (garment === "jacket") {
    score += 4
    reasons.push("The safe choice on jackets, and the only option on puffers.")
  } else if (garment === "polo") {
    score += 4
    reasons.push("Polos and workwear are where a stitched logo looks most at home.")
  } else if (artwork === "solid") {
    score -= 1
    reasons.push("A large stitched graphic gets heavy and stiff on a tee.")
  }
  if (artwork === "logo") {
    score += 2
    reasons.push("Small logos stitch cleanly and read as premium.")
  }
  if (quantity === "small") score += 1
  return { method: "embroidery", score, blocked: false, reasons }
}

/** Ties go to the method with the least commitment: DTF, then screen, then embroidery. */
const TIE_ORDER: Method[] = ["dtf", "screen", "embroidery"]

export function recommendMethods(answers: Answers): Ranked[] {
  const scored = [scoreDtf(answers), scoreScreen(answers), scoreEmbroidery(answers)].sort(
    (a, b) =>
      Number(a.blocked) - Number(b.blocked) ||
      b.score - a.score ||
      TIE_ORDER.indexOf(a.method) - TIE_ORDER.indexOf(b.method)
  )
  return scored.map((s, i) => ({
    method: s.method,
    verdict: s.blocked ? "avoid" : i === 0 ? "best" : "works",
    reasons: s.reasons,
  }))
}
