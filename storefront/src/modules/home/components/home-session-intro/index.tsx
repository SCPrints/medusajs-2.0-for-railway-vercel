"use client"

import Image from "next/image"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

const STORAGE_KEY = "sc-home-intro-session"

/** Final zoom scale — 1 keeps logo + tagline within the constrained column (no viewport overflow) */
const ZOOM_END_SCALE = 1
const ZOOM_MS = 2800
/** Time for particle burst to clear the screen */
const EXPLODE_MS = 3800
/** Overlay fade after explosion */
const OVERLAY_FADE_MS = 520
const PARTICLE_MIN = 20
const PARTICLE_MAX = 30

const LOGO_SRC = "/branding/sc-prints-logo-transparent.png"
const LOGO_CLASS =
  "mx-auto w-full max-w-[min(18rem,82vw)] h-auto max-h-[min(32vh,11rem)] object-contain object-center small:max-h-[min(34vh,13rem)]"
const LOGO_W = 832
const LOGO_H = 274

type ParticleSpec = {
  tx: string
  ty: string
  rot: number
  width: number
  delayMs: number
}

function generateParticles(count: number): ParticleSpec[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2
    const dist = 90 + Math.random() * 110
    const tx = `${Math.cos(angle) * dist}vmin`
    const ty = `${Math.sin(angle) * dist}vmin`
    return {
      tx,
      ty,
      rot: (Math.random() - 0.5) * 900,
      width: 32 + Math.floor(Math.random() * 28),
      delayMs: Math.random() * 140,
    }
  })
}

/** Full-screen intro shown once per browser tab session on the home page only. */
export default function HomeSessionIntro({
  children,
}: {
  children: React.ReactNode
}) {
  const [active, setActive] = useState(false)
  const [phase, setPhase] = useState<"zoom" | "explode" | "fading">("zoom")
  const [zoomScale, setZoomScale] = useState(0.028)
  const [particles, setParticles] = useState<ParticleSpec[] | null>(null)
  const [fly, setFly] = useState(false)
  const [overlayFade, setOverlayFade] = useState(false)
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const explodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useLayoutEffect(() => {
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY)) {
        return
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        window.sessionStorage.setItem(STORAGE_KEY, "1")
        return
      }
      setActive(true)
    } catch {
      setActive(false)
    }
  }, [])

  useEffect(() => {
    if (!active) {
      return
    }
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [active])

  useEffect(() => {
    if (!active || phase !== "zoom") {
      return
    }
    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setZoomScale(ZOOM_END_SCALE)
      }
    })
    zoomTimerRef.current = window.setTimeout(() => {
      if (!cancelled) {
        const n =
          PARTICLE_MIN +
          Math.floor(Math.random() * (PARTICLE_MAX - PARTICLE_MIN + 1))
        setParticles(generateParticles(n))
        setPhase("explode")
      }
    }, ZOOM_MS)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      if (zoomTimerRef.current) {
        window.clearTimeout(zoomTimerRef.current)
        zoomTimerRef.current = null
      }
    }
  }, [active, phase])

  useEffect(() => {
    if (phase !== "explode" || !particles) {
      return
    }
    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setFly(true)
      }
    })
    explodeTimerRef.current = window.setTimeout(() => {
      if (!cancelled) {
        setOverlayFade(true)
        setPhase("fading")
      }
    }, EXPLODE_MS + 120)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      if (explodeTimerRef.current) {
        window.clearTimeout(explodeTimerRef.current)
        explodeTimerRef.current = null
      }
    }
  }, [phase, particles])

  useEffect(() => {
    if (!overlayFade) {
      return
    }
    const t = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, "1")
      } catch {
        // ignore
      }
      setActive(false)
    }, OVERLAY_FADE_MS + 80)
    return () => window.clearTimeout(t)
  }, [overlayFade])

  return (
    <>
      {children}
      {active ? (
        <div
          aria-hidden
          className={`home-session-intro-overlay fixed inset-0 z-[100] overflow-hidden bg-[var(--brand-background)] ${
            overlayFade ? "opacity-0" : "opacity-100"
          }`}
          style={{
            transition: overlayFade
              ? `opacity ${OVERLAY_FADE_MS}ms ease-out`
              : "none",
          }}
        >
          {phase === "zoom" ? (
            <div className="flex h-full w-full items-center justify-center px-3 py-6 small:px-6">
              <div
                className="box-border flex w-full max-w-[min(92vw,26rem)] flex-col items-center gap-5 will-change-transform small:max-w-[min(92vw,28rem)]"
                style={{
                  transform: `scale(${zoomScale})`,
                  transformOrigin: "center center",
                  transition: `transform ${ZOOM_MS}ms cubic-bezier(0.2, 0.85, 0.25, 1)`,
                }}
              >
                <Image
                  src={LOGO_SRC}
                  alt=""
                  width={LOGO_W}
                  height={LOGO_H}
                  className={`${LOGO_CLASS} select-none`}
                  priority
                />
                <p className="w-full max-w-[min(100%,20rem)] text-balance text-center text-sm font-semibold uppercase leading-snug tracking-[0.14em] text-ui-fg-base small:max-w-[min(100%,22rem)] small:text-base small:tracking-[0.16em]">
                  Premium custom apparel for Australian teams &amp; brands
                </p>
              </div>
            </div>
          ) : null}

          {phase === "explode" || phase === "fading" ? (
            particles ? (
              <div
                className="pointer-events-none absolute inset-0"
                aria-hidden
              >
                {particles.map((p, i) => (
                  <Image
                    key={`p-${i}`}
                    src={LOGO_SRC}
                    alt=""
                    width={p.width}
                    height={Math.max(
                      12,
                      Math.round((p.width * LOGO_H) / LOGO_W)
                    )}
                    className="absolute opacity-95"
                    style={{
                      left: "50%",
                      top: "50%",
                      width: p.width,
                      height: "auto",
                      transform: fly
                        ? `translate(calc(-50% + ${p.tx}), calc(-50% + ${p.ty})) rotate(${p.rot}deg)`
                        : "translate(-50%, -50%) rotate(0deg)",
                      transition: fly
                        ? `transform ${EXPLODE_MS}ms cubic-bezier(0.18, 0.75, 0.22, 1) ${p.delayMs}ms`
                        : "none",
                    }}
                    priority={i < 6}
                  />
                ))}
              </div>
            ) : null
          ) : null}
        </div>
      ) : null}
    </>
  )
}
