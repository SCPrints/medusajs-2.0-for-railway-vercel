"use client"

import type { ComponentType, CSSProperties, SVGProps } from "react"

import { Bat, Boo, Cloud, Cobweb, Ghost, InkDefs, Moon, Pumpkin, Skyline } from "./art"
import { CandyCorn, CapSpider, CatInBox, Mummy, Patchwork, Skeleton, StampGhost, Vampire, Witch, ZombieHand } from "./cast"
import s from "./halloween.module.css"
import { usePageHidden } from "./use-page-hidden"

type Entry = {
  label: string
  /** One-line personality note (shown on the review sheet). */
  note: string
  C: ComponentType<SVGProps<SVGSVGElement>>
}

/** Every Halloween mascot, old and new. Keys are the `name` prop of <HalloweenMascot>. */
export const MASCOTS = {
  ghost: { label: "Ghost", note: "Peeks from behind things and yells BOO before it's ready.", C: Ghost },
  boo: { label: "BOO!", note: "The ghost's catchphrase, hand-lettered with speed lines.", C: Boo },
  pumpkin: { label: "Pumpkin", note: "Laughs at its own jokes with both hands on its belly.", C: Pumpkin },
  bat: { label: "Bat", note: "Cheeky, tongue out, always leaning into the dive.", C: Bat },
  moon: { label: "Moon", note: "Half asleep, faces sideways so nobody notices.", C: Moon },
  cloud: { label: "Cloud", note: "Drifts past on twos; refuses to look like a circle.", C: Cloud },
  skyline: { label: "Town", note: "Round-roofed town with a riveted water tank and a signature on the hill.", C: Skyline },
  cobweb: { label: "Cobweb", note: "Pink spider in charge; one bat not in charge of anything.", C: Cobweb },
  skeleton: { label: "Hoodie skeleton", note: "Wears the SC hoodie three sizes up and insists that's the fit.", C: Skeleton },
  witch: { label: "Ink witch", note: "Brews the house black; stirs anticlockwise for extra opacity.", C: Witch },
  cat: { label: "Cat in a box", note: "Every delivery box is a cat box now. Do not question the arrow.", C: CatInBox },
  mummy: { label: "Film mummy", note: "Wrapped in last Tuesday's DTF roll and still peeling at one end.", C: Mummy },
  patchwork: { label: "Patchwork monster", note: "Sewn from offcuts, two different sleeves, proud of every seam.", C: Patchwork },
  vampire: { label: "Squeegee vampire", note: "Pulls one perfect pass, then hides from the UV lamp.", C: Vampire },
  "zombie-hand": { label: "Zombie hand", note: "Fresh from the press, fresher from the ground; the print is the one smiling.", C: ZombieHand },
  "cap-spider": { label: "Cap spider", note: "Studio foreman on a thread. The cap is non-negotiable.", C: CapSpider },
  "candy-corn": { label: "Candy-corn trio", note: "Agree on nothing except that they're sold as a set.", C: CandyCorn },
  "stamp-ghost": { label: "Stamp ghost", note: "Approves proofs all day; cannot approve its own haircut.", C: StampGhost },
} satisfies Record<string, Entry>

export type MascotName = keyof typeof MASCOTS
export const MASCOT_NAMES = Object.keys(MASCOTS) as MascotName[]

type Props = {
  name: MascotName
  /** Rendered width in px (height follows the artwork's aspect). */
  size?: number
  /** Idle 2–3 frame hold loop (still respects prefers-reduced-motion). */
  animate?: boolean
  /** Decorative by default (aria-hidden). Pass false to expose the label to AT. */
  decorative?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * Drop-in Halloween mascot: `<HalloweenMascot name="skeleton" size={120} />`.
 * Renders the shared ink defs alongside, so it works on any page. Pair with
 * `SeasonalMascot` (themes/components) to lazy-load it only when the theme
 * is active.
 */
export function HalloweenMascot({ name, size = 120, animate = true, decorative = true, className, style }: Props) {
  const hidden = usePageHidden()
  const m = MASCOTS[name]
  const cls = [s.mascot, animate ? s.idle : s.still, hidden ? s.paused : "", className ?? ""].filter(Boolean).join(" ")
  return (
    <>
      <InkDefs />
      <m.C
        className={cls}
        style={{ width: size, ...style }}
        focusable="false"
        data-mascot={name}
        {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": m.label })}
      />
    </>
  )
}
