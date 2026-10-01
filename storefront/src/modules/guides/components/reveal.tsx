"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

type Props = {
  children: ReactNode
  /** Seconds — stagger siblings by passing index * 0.08 or similar. */
  delay?: number
  className?: string
}

/**
 * One-shot fade-up when a block first scrolls into view. Plays once and stays —
 * not scroll-scrubbed.
 *
 * Fail-visible by design: the server HTML (and any no-JS / pre-hydration view)
 * renders the content normally. Only blocks that are still BELOW the viewport
 * when the page hydrates are hidden and then revealed, so nothing on screen
 * ever flashes and nothing can be left invisible. The motion is a CSS
 * transition (no animation loop); reduced-motion users get no hiding at all.
 * Children can react via `group-data-[shown=false]/reveal:`.
 */
export default function Reveal({ children, delay = 0, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // null = undecided (visible) · false = waiting below the fold · true = revealed
  const [shown, setShown] = useState<boolean | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (el.getBoundingClientRect().top < window.innerHeight) return

    setShown(false)
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: "0px 0px -60px 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      data-shown={shown ?? undefined}
      style={shown ? { transitionDelay: `${delay}s` } : undefined}
      className={`group/reveal transition-[opacity,transform] duration-500 ease-out ${
        shown === false ? "translate-y-4 opacity-0" : ""
      } ${className}`}
    >
      {children}
    </div>
  )
}
