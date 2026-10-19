import { Metadata } from "next"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import HalloweenCastSheet from "@modules/themes/halloween/cast-sheet"

export const metadata: Metadata = {
  title: "Halloween cast",
  description: "Review sheet of every Halloween theme mascot, old and new.",
  robots: { index: false, follow: false },
}

/**
 * Owner review page for the Halloween mascots. Shows the whole cast at
 * 240px regardless of the active theme (it's a lab page, not a decoration),
 * so the artwork is imported statically here — nothing else links to it.
 */
export default function HalloweenSandboxPage() {
  return (
    <div className="content-container py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ui-fg-muted">
        <LocalizedClientLink href="/sandbox" className="hover:underline">
          Animation Lab
        </LocalizedClientLink>{" "}
        / Halloween cast
      </p>
      <h1 className="page-title-marketing mt-3">Halloween mascots</h1>
      <p className="mt-3 max-w-2xl text-base text-ui-fg-subtle">
        Every mascot in the Halloween theme at 240px: the hero/header set plus the
        extended print-shop cast. Each is an original character drawn in code
        (manga ink + cel paint) and can be dropped on any page with{" "}
        <code className="text-sm">{'<HalloweenMascot name="…" size={…} />'}</code>.
        Animations are 2–3 frame holds and switch off under reduced motion.
      </p>
      <div className="mt-10">
        <HalloweenCastSheet />
      </div>
    </div>
  )
}
