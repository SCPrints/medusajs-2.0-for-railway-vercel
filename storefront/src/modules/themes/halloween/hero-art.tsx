"use client"

import { useEffect, useRef, useState } from "react"

import { Bat, Ghost, JackOLantern, Moon } from "./art"
import s from "./halloween.module.css"
import { usePageHidden, useReducedMotion } from "./use-page-hidden"

const BAT_COUNT = 3
/** At most this many bats in the air at once — a flit, not a swarm. */
const MAX_FLYING = 2

type Flight = {
  start: number
  duration: number
  dir: 1 | -1
  y0: number
  amp: number
  waves: number
  scale: number
}

/**
 * Halloween overlay for the home hero: dusk tint + moon + ghost in the top
 * right, a flickering jack-o'-lantern bottom right, and a few bats flitting
 * across on a requestAnimationFrame loop. Everything is aria-hidden and
 * pointer-events: none. No bats (and no CSS motion) under reduced motion;
 * the loop stops while the tab is hidden or the hero is scrolled away.
 */
export default function HalloweenHeroArt() {
  const layerRef = useRef<HTMLDivElement>(null)
  const batRefs = useRef<(HTMLDivElement | null)[]>([])
  const hidden = usePageHidden()
  const reduced = useReducedMotion()
  const [onScreen, setOnScreen] = useState(true)

  useEffect(() => {
    const el = layerRef.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const running = !hidden && !reduced && onScreen

  useEffect(() => {
    const layer = layerRef.current
    if (!running || !layer) return

    const flights: (Flight | null)[] = Array(BAT_COUNT).fill(null)
    let nextSpawn = performance.now() + 800
    let raf = 0

    const place = (i: number, x: number, y: number, scale: number, dir: number) => {
      const el = batRefs.current[i]
      if (el) {
        el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${dir * scale}, ${scale})`
      }
    }

    const tick = (now: number) => {
      const w = layer.clientWidth
      const h = layer.clientHeight

      if (now >= nextSpawn && flights.filter(Boolean).length < MAX_FLYING) {
        const slot = flights.findIndex((f) => !f)
        if (slot !== -1) {
          flights[slot] = {
            start: now,
            duration: 7000 + Math.random() * 4000,
            dir: Math.random() < 0.5 ? 1 : -1,
            y0: h * (0.12 + Math.random() * 0.45),
            amp: 14 + Math.random() * 22,
            waves: 2 + Math.random() * 2,
            scale: 0.6 + Math.random() * 0.5,
          }
        }
        nextSpawn = now + 3500 + Math.random() * 5500
      }

      flights.forEach((f, i) => {
        if (!f) return
        const p = (now - f.start) / f.duration
        if (p >= 1) {
          flights[i] = null
          place(i, -200, -200, 1, 1)
          return
        }
        const span = w + 120
        const x = f.dir === 1 ? -60 + p * span : w + 60 - p * span
        const y = f.y0 + Math.sin(p * Math.PI * 2 * f.waves) * f.amp
        place(i, x, y, f.scale, f.dir)
      })

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      for (let i = 0; i < BAT_COUNT; i++) place(i, -200, -200, 1, 1)
    }
  }, [running])

  return (
    <div
      ref={layerRef}
      aria-hidden
      className={`${s.layer}${running ? "" : ` ${s.paused}`}`}
      data-testid="halloween-hero-art"
    >
      <div className={s.dusk} />
      <Moon className={s.moon} focusable="false" />
      <Ghost className={s.ghost} focusable="false" />
      <JackOLantern className={s.pumpkin} focusable="false" />
      {!reduced &&
        Array.from({ length: BAT_COUNT }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              batRefs.current[i] = el
            }}
            className={s.bat}
          >
            <Bat focusable="false" />
          </div>
        ))}
    </div>
  )
}
