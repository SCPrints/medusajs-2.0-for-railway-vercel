"use client"

import { Player } from "@lordicon/react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from "react"

export type FallbackIcon = ComponentType<
  SVGProps<SVGSVGElement> & { className?: string; "aria-hidden"?: boolean }
>

type Props = {
  lordiconJsonUrl: string
  /** Pixel size passed to Lordicon Player (container should match visually). */
  size: number
  /** Decorative only; pairing text provides the accessible name. */
  className?: string
  /** Shown while loading, on fetch error, and when prefers-reduced-motion is set. */
  FallbackIcon: FallbackIcon
  fallbackClassName?: string
}

/** Inline decorative icon using Lordicon with static SVG fallback. */
export default function LordiconDecorativeIcon({
  lordiconJsonUrl,
  size,
  className,
  FallbackIcon,
  fallbackClassName = "h-6 w-6",
}: Props) {
  const playerRef = useRef<Player>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [iconData, setIconData] = useState<unknown>(null)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true)
      return
    }
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      { rootMargin: "160px", threshold: 0.01 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!shouldLoad || reducedMotion) return
    let cancelled = false
    fetch(lordiconJsonUrl)
      .then((res) => {
        if (!res.ok) throw new Error("Lordicon fetch failed")
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setIconData(data)
      })
      .catch(() => {
        if (!cancelled) setFetchFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [lordiconJsonUrl, shouldLoad, reducedMotion])

  const replay = useCallback(() => {
    playerRef.current?.playFromBeginning()
  }, [])

  const loadingAnimated =
    shouldLoad &&
    !reducedMotion &&
    !fetchFailed &&
    !iconData

  const showPlayer =
    shouldLoad &&
    !reducedMotion &&
    !fetchFailed &&
    !!iconData

  return (
    <div
      ref={containerRef}
      className={className}
      aria-hidden
      onMouseEnter={showPlayer ? replay : undefined}
      onFocus={showPlayer ? replay : undefined}
    >
      {loadingAnimated ? (
        <div
          className="animate-pulse rounded-full bg-ui-bg-muted"
          style={{ width: size, height: size }}
        />
      ) : null}
      {showPlayer ? <Player ref={playerRef} icon={iconData} size={size} /> : null}
      {!loadingAnimated && !showPlayer ? (
        <FallbackIcon className={fallbackClassName} aria-hidden />
      ) : null}
    </div>
  )
}
