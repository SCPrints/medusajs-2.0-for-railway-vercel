"use client"

import { Player } from "@lordicon/react"
import { useCallback, useEffect, useRef, useState } from "react"

const LORDICON_SAMPLES: { label: string; url: string }[] = [
  { label: "Lock", url: "https://cdn.lordicon.com/egmlnyku.json" },
  { label: "Rocket", url: "https://cdn.lordicon.com/wxnxiano.json" },
  { label: "Mail", url: "https://cdn.lordicon.com/rhvddzym.json" },
]

function LordiconButton({ label, url }: { label: string; url: string }) {
  const playerRef = useRef<Player>(null)
  const [icon, setIcon] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setIcon(data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIcon(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [url])

  const play = useCallback(() => {
    playerRef.current?.playFromBeginning()
  }, [])

  if (!icon) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="h-14 w-14 animate-pulse rounded-full bg-ui-bg-base" aria-hidden />
        <span className="text-xs text-ui-fg-muted">{label}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="group flex flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-ui-bg-base"
      onMouseEnter={play}
      onFocus={play}
      onClick={play}
    >
      <Player ref={playerRef} icon={icon} size={56} />
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
