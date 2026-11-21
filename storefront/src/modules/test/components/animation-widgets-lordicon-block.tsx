"use client"

import { LordIcon } from "@lordicon/react"
import { useRef } from "react"

const LORDICON_SAMPLES: { label: string; url: string }[] = [
  { label: "Lock", url: "https://cdn.lordicon.com/egmlnyku.json" },
  { label: "Rocket", url: "https://cdn.lordicon.com/wxnxiano.json" },
  { label: "Mail", url: "https://cdn.lordicon.com/rhvddzym.json" },
]

function LordiconButton({ label, url }: { label: string; url: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null)

  // ponytail: @lordicon/react 2 loads the icon and plays it on hover of
  // `target` itself, so no fetch/play wiring here.
  return (
    <button
      ref={buttonRef}
      type="button"
      className="group flex flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-ui-bg-base"
    >
      <LordIcon
        src={url}
        trigger="hover"
        target={buttonRef}
        style={{ width: 56, height: 56 }}
      />
      <span className="text-xs font-medium text-ui-fg-subtle group-hover:text-ui-fg-base">{label}</span>
    </button>
  )
}

export default function AnimationWidgetsLordiconBlock() {
  return (
    <div className="flex flex-wrap gap-4">
      {LORDICON_SAMPLES.map((s) => (
        <LordiconButton key={s.url} label={s.label} url={s.url} />
      ))}
    </div>
  )
}
