"use client"

import { motion } from "framer-motion"
import { useCallback, useState } from "react"
import type { CSSProperties } from "react"

export function LabTierDContentVisibilityDemo({ reducedMotion: _rm }: { reducedMotion: boolean }) {
  return (
    <div className="max-w-lg space-y-3 text-sm">
      <p className="text-xs text-ui-fg-muted">
        Sections below use <code className="text-[10px]">content-visibility: auto</code> so off-screen blocks skip
        layout/paint work. Good for long PDP pages; pair with explicit min-height if you need scrollbar stability.
      </p>
      <div className="max-h-56 overflow-auto rounded-xl border border-ui-border-base">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="border-b border-ui-border-base bg-ui-bg-subtle px-4 py-8 [content-visibility:auto]"
            style={{ containIntrinsicSize: "auto 120px" } satisfies CSSProperties}
          >
            Block {i + 1} — scroll to materialize.
          </div>
        ))}
      </div>
    </div>
  )
}

const CARD_A = { title: "Card A", body: "Swap with View Transitions API where supported." }
const CARD_B = { title: "Card B", body: "Graceful fallback: instant crossfade only." }

export function LabTierDViewTransitionScoped({ reducedMotion }: { reducedMotion: boolean }) {
  const [useA, setUseA] = useState(true)
  const c = useA ? CARD_A : CARD_B

  const swap = useCallback(() => {
    const run = () => setUseA((v) => !v)
    if (
      !reducedMotion &&
      typeof document !== "undefined" &&
      "startViewTransition" in document &&
      typeof (document as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition ===
        "function"
    ) {
      ;(document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(run)
    } else {
      run()
    }
  }, [reducedMotion])

  return (
    <div className="max-w-md space-y-3">
      <button type="button" className="text-sm underline" onClick={swap}>
        Swap cards
      </button>
      <motion.div
        layout
        className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4"
        style={
          reducedMotion
            ? undefined
            : ({ viewTransitionName: "tier-d-vt-card" } as CSSProperties & { viewTransitionName?: string })
        }
      >
        <h3 className="font-semibold text-ui-fg-base">{c.title}</h3>
        <p className="mt-2 text-sm text-ui-fg-muted">{c.body}</p>
      </motion.div>
    </div>
  )
}

export function LabTierDScrollbarGutterDemo({ reducedMotion: _rm }: { reducedMotion: boolean }) {
  return (
    <div className="max-w-md space-y-3 text-sm">
      <p className="text-xs text-ui-fg-muted">
        Panel uses <code className="text-[10px]">scrollbar-gutter: stable</code> plus header{" "}
        <code className="text-[10px]">scroll-padding-top</code> so in-panel anchors respect a sticky sub-header.
      </p>
      <div
        className="max-h-44 overflow-auto rounded-xl border border-ui-border-base [scrollbar-gutter:stable]"
        style={{ scrollPaddingTop: 40 }}
      >
        <div className="sticky top-0 z-10 border-b border-ui-border-base bg-ui-bg-base px-3 py-2 text-xs font-medium">
          Sticky mini header
        </div>
        <div id="tier-d-scroll-a" className="h-32 scroll-mt-10 px-3 pt-4">
          Section A — <a href="#tier-d-scroll-b" className="text-[#FF2E63] underline">jump to B</a>
        </div>
        <div id="tier-d-scroll-b" className="h-32 scroll-mt-10 border-t border-ui-border-base px-3 pt-4">
          Section B — <a href="#tier-d-scroll-a" className="text-[#FF2E63] underline">back to A</a>
        </div>
        <div className="h-24 px-3 text-ui-fg-muted">Tail</div>
      </div>
    </div>
  )
}
