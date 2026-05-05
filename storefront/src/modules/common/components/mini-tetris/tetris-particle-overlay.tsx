"use client"

import { useEffect, useRef } from "react"

import {
  parseHexColor,
  WORDMARK_GRADIENT,
} from "@modules/common/lib/wordmark-gradient"

const BOARD_W = 10
const BOARD_H = 20

/** Visible particles per filled cell. Each gets a small jitter offset around the cell centre. */
const PARTICLES_PER_CELL = 12
/** Hard cap so wild board states don't allocate unbounded memory. */
const MAX_PARTICLES = 6000
/** Particles spawned per cell when the active piece locks. */
const LOCK_BURST_PER_CELL = 16
/** Particles spawned per cell when a line is cleared. */
const CLEAR_BURST_PER_CELL = 24
/** Burst lifetime (ms). */
const BURST_LIFE_MS = 700
/** Spring stiffness pulling resident particles back to home each frame. */
const HOME_SPRING = 0.085
/** Friction multiplier for resident particles. */
const HOME_FRICTION = 0.85
/** Cursor disturbance radius (CSS px). */
const CURSOR_RADIUS = 55
/** Peak repel force at cursor centre (CSS px / frame²). */
const CURSOR_FORCE = 4.5
/** Tangential side-swirl force around cursor. */
const CURSOR_SWIRL = 1.4
/** Particle drawn size (CSS px). Larger reads chunkier; matches enlarged tetris cells. */
const PARTICLE_SIZE = 2.2
/** Burst initial speed (CSS px / frame). */
const BURST_SPEED_MAX = 5.5

type Active = { t: number; r: number; x: number; y: number }
type Display = number[][]
type Board = number[][]

type Particle = {
  alive: boolean
  type: "resident" | "burst"
  /** "A:idx" for active piece (idx 0..3), "L:bx,by" for locked, "" for burst. */
  cellKey: string
  /** Sub-jitter offset within the cell, 0..PARTICLES_PER_CELL-1. */
  subIdx: number
  hx: number
  hy: number
  x: number
  y: number
  vx: number
  vy: number
  bornAt: number
  lifeMs: number
}

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>
  display: Display
  board: Board
  active: Active | null
  lines: number
}

/** Deterministic 0..1 value derived from two ints — used for jitter offsets so a given
 * sub-particle keeps the same offset across frames. */
function hash01(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 10000) / 10000
}

export default function TetrisParticleOverlay({
  containerRef,
  display,
  board,
  active,
  lines,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** Live props (read inside the RAF closure without re-creating the loop). */
  const propsRef = useRef({ display, board, active, lines })
  propsRef.current = { display, board, active, lines }
  /** Previous-frame snapshot used to detect lock and line-clear events. */
  const prevRef = useRef<{
    display: Display
    board: Board
    active: Active | null
    lines: number
  }>({ display, board, active, lines })

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
    const sizeState = { cssW: 0, cssH: 0, cellW: 0, cellH: 0, padX: 0, padY: 0 }

    /** Cursor in canvas-CSS coords. */
    const cursor = { x: -1e6, y: -1e6, prevX: -1e6, prevY: -1e6, vx: 0, vy: 0, inside: false }

    const particles: Particle[] = []
    /** Quick access by cellKey → list of resident particles for that cell. */
    const residentsByKey = new Map<string, Particle[]>()

    /** Pre-parsed gradient stops + axis. Recomputed per frame so projection extents
     * adapt to canvas size. */
    const gradStops = WORDMARK_GRADIENT.stops.map(parseHexColor)

    const allocateParticle = (): Particle | null => {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!
        if (!p.alive) {
          return p
        }
      }
      if (particles.length >= MAX_PARTICLES) {
        return null
      }
      const fresh: Particle = {
        alive: false,
        type: "resident",
        cellKey: "",
        subIdx: 0,
        hx: 0,
        hy: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        bornAt: 0,
        lifeMs: 0,
      }
      particles.push(fresh)
      return fresh
    }

    const releaseFromKey = (key: string) => {
      const list = residentsByKey.get(key)
      if (!list) return
      for (const p of list) {
        p.alive = false
      }
      residentsByKey.delete(key)
    }

    const spawnResident = (key: string, cx: number, cy: number) => {
      let list = residentsByKey.get(key)
      if (!list) {
        list = []
        residentsByKey.set(key, list)
      }
      while (list.length < PARTICLES_PER_CELL) {
        const p = allocateParticle()
        if (!p) return
        const sub = list.length
        p.alive = true
        p.type = "resident"
        p.cellKey = key
        p.subIdx = sub
        const ox = (hash01(sub, 7) - 0.5) * sizeState.cellW * 0.7
        const oy = (hash01(sub, 13) - 0.5) * sizeState.cellH * 0.7
        p.hx = cx + ox
        p.hy = cy + oy
        p.x = p.hx
        p.y = p.hy
        p.vx = 0
        p.vy = 0
        p.bornAt = performance.now()
        p.lifeMs = 0
        list.push(p)
      }
    }

    const updateResidentHomes = (key: string, cx: number, cy: number) => {
      const list = residentsByKey.get(key)
      if (!list) return
      for (const p of list) {
        const ox = (hash01(p.subIdx, 7) - 0.5) * sizeState.cellW * 0.7
        const oy = (hash01(p.subIdx, 13) - 0.5) * sizeState.cellH * 0.7
        p.hx = cx + ox
        p.hy = cy + oy
      }
    }

    const spawnBurst = (cx: number, cy: number, count: number, speedMax: number) => {
      const now = performance.now()
      for (let i = 0; i < count; i++) {
        const p = allocateParticle()
        if (!p) return
        p.alive = true
        p.type = "burst"
        p.cellKey = ""
        p.subIdx = 0
        const angle = Math.random() * Math.PI * 2
        const speed = speedMax * (0.4 + 0.6 * Math.random())
        p.x = cx + (Math.random() - 0.5) * sizeState.cellW * 0.4
        p.y = cy + (Math.random() - 0.5) * sizeState.cellH * 0.4
        p.hx = p.x
        p.hy = p.y
        p.vx = Math.cos(angle) * speed
        p.vy = Math.sin(angle) * speed
        p.bornAt = now
        p.lifeMs = BURST_LIFE_MS * (0.7 + 0.6 * Math.random())
      }
    }

    /** Get screen-CSS centre of board cell (bx, by). */
    const cellCentre = (bx: number, by: number): { x: number; y: number } => {
      const cx = sizeState.padX + (bx + 0.5) * sizeState.cellW
      const cy = sizeState.padY + (by + 0.5) * sizeState.cellH
      return { x: cx, y: cy }
    }

    /** Active piece cells in board coords from (active, t, r). Uses SHAPES indirectly:
     * we extract from `display - board` (cells in display but not in locked board). */
    const computeActiveCells = (
      disp: Display,
      brd: Board
    ): Array<{ bx: number; by: number; idx: number }> => {
      const out: Array<{ bx: number; by: number; idx: number }> = []
      let idx = 0
      for (let by = 0; by < BOARD_H && idx < 4; by++) {
        for (let bx = 0; bx < BOARD_W && idx < 4; bx++) {
          if (disp[by]?.[bx] !== 0 && brd[by]?.[bx] === 0) {
            out.push({ bx, by, idx })
            idx++
          }
        }
      }
      return out
    }

    const layoutCanvas = () => {
      const rect = container.getBoundingClientRect()
      sizeState.cssW = rect.width
      sizeState.cssH = rect.height
      /** Mirror the grid layout: 1px gap between cells, 1px padding. */
      const gap = 1
      const pad = 4
      sizeState.padX = pad
      sizeState.padY = pad
      sizeState.cellW = (rect.width - pad * 2 - gap * (BOARD_W - 1)) / BOARD_W + gap
      sizeState.cellH = (rect.height - pad * 2 - gap * (BOARD_H - 1)) / BOARD_H + gap
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    layoutCanvas()
    const ro = new ResizeObserver(() => layoutCanvas())
    ro.observe(container)

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      cursor.x = x
      cursor.y = y
      cursor.inside =
        x >= -CURSOR_RADIUS &&
        x <= rect.width + CURSOR_RADIUS &&
        y >= -CURSOR_RADIUS &&
        y <= rect.height + CURSOR_RADIUS
    }
    const onPointerLeave = () => {
      cursor.inside = false
      cursor.x = -1e6
      cursor.y = -1e6
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    window.addEventListener("pointerleave", onPointerLeave)

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const W = sizeState.cssW
      const H = sizeState.cssH
      if (W < 2 || H < 2) return
      const now = performance.now()

      /** Update cursor velocity (CSS px/frame). */
      if (cursor.prevX > -1e5) {
        cursor.vx = cursor.x - cursor.prevX
        cursor.vy = cursor.y - cursor.prevY
      }
      cursor.prevX = cursor.x
      cursor.prevY = cursor.y

      const { display: dispNow, board: brdNow, active: actNow, lines: linesNow } =
        propsRef.current
      const prev = prevRef.current

      /** ============ Event detection ============ */

      /** Line clears: lines counter went up. Find which rows of prev.board were full
       * and aren't present in brdNow (rows shifted). Spawn clear burst at those rows. */
      if (linesNow > prev.lines) {
        for (let by = 0; by < BOARD_H; by++) {
          const wasFull =
            prev.board[by] != null &&
            prev.board[by]!.every((c) => c !== 0)
          if (!wasFull) continue
          for (let bx = 0; bx < BOARD_W; bx++) {
            const c = cellCentre(bx, by)
            spawnBurst(c.x, c.y, CLEAR_BURST_PER_CELL, BURST_SPEED_MAX)
          }
        }
      }

      /** Lock: any prev active-piece cell (cell that was in display but not in board)
       * is now present in the current locked board. */
      const prevActive = computeActiveCells(prev.display, prev.board)
      let lockedThisFrame = false
      for (const cell of prevActive) {
        const wasInBoard = prev.board[cell.by]?.[cell.bx] !== 0
        const nowInBoard = brdNow[cell.by]?.[cell.bx] !== 0
        if (!wasInBoard && nowInBoard) {
          lockedThisFrame = true
          const c = cellCentre(cell.bx, cell.by)
          spawnBurst(c.x, c.y, LOCK_BURST_PER_CELL, BURST_SPEED_MAX * 0.85)
        }
      }

      /** ============ Resident particle reconciliation ============ */

      /** Build current cell map. Active cells use stable keys A:0..A:3 so movement
       * doesn't kill/respawn particles. Locked cells use L:bx,by. */
      const currentKeys = new Set<string>()
      const currentCellByKey = new Map<string, { x: number; y: number }>()

      const activeCells = computeActiveCells(dispNow, brdNow)
      for (const ac of activeCells) {
        const key = `A:${ac.idx}`
        currentKeys.add(key)
        currentCellByKey.set(key, cellCentre(ac.bx, ac.by))
      }
      for (let by = 0; by < BOARD_H; by++) {
        for (let bx = 0; bx < BOARD_W; bx++) {
          if (brdNow[by]?.[bx] !== 0) {
            const key = `L:${bx},${by}`
            currentKeys.add(key)
            currentCellByKey.set(key, cellCentre(bx, by))
          }
        }
      }

      /** When the piece locks, the previous A:0..A:3 particles should NOT carry over
       * to a fresh active piece — release them so the burst stands in for the
       * transition and new locked-cell particles allocate cleanly. */
      if (lockedThisFrame) {
        for (let i = 0; i < 4; i++) releaseFromKey(`A:${i}`)
      }

      /** Drop residents whose key vanished. */
      for (const key of Array.from(residentsByKey.keys())) {
        if (!currentKeys.has(key)) {
          releaseFromKey(key)
        }
      }
      /** Add residents for new keys, update homes for existing. */
      currentCellByKey.forEach((pos, key) => {
        if (residentsByKey.has(key)) {
          updateResidentHomes(key, pos.x, pos.y)
        } else {
          spawnResident(key, pos.x, pos.y)
        }
      })

      /** ============ Physics ============ */

      const cursorX = cursor.x
      const cursorY = cursor.y
      const cursorActive = cursor.inside
      const R = CURSOR_RADIUS
      const R2 = R * R

      for (const p of particles) {
        if (!p.alive) continue
        if (p.type === "burst") {
          const age = now - p.bornAt
          if (age >= p.lifeMs) {
            p.alive = false
            continue
          }
          /** Burst particles fly outward and decay. Slight drag + downward gravity. */
          p.vx *= 0.92
          p.vy *= 0.92
          p.vy += 0.08
          p.x += p.vx
          p.y += p.vy
        } else {
          /** Resident: spring toward home + cursor disturbance. */
          if (cursorActive) {
            const dx = p.x - cursorX
            const dy = p.y - cursorY
            const d2 = dx * dx + dy * dy
            if (d2 < R2 && d2 > 0.5) {
              const d = Math.sqrt(d2)
              const fall = (R - d) / R
              const fallSq = fall * fall
              const nx = dx / d
              const ny = dy / d
              p.vx += nx * CURSOR_FORCE * fallSq
              p.vy += ny * CURSOR_FORCE * fallSq
              /** Tangential swirl around cursor — 90° rotation of normal. */
              p.vx += -ny * CURSOR_SWIRL * fallSq
              p.vy += nx * CURSOR_SWIRL * fallSq
            }
          }
          p.vx += (p.hx - p.x) * HOME_SPRING
          p.vy += (p.hy - p.y) * HOME_SPRING
          p.vx *= HOME_FRICTION
          p.vy *= HOME_FRICTION
          p.x += p.vx
          p.y += p.vy
        }
      }

      /** ============ Render ============ */

      ctx.clearRect(0, 0, W, H)

      /** Compute gradient projection extents: project canvas corners onto axis. */
      const angleRad = (WORDMARK_GRADIENT.angleDeg * Math.PI) / 180
      const gdx = Math.sin(angleRad)
      const gdy = -Math.cos(angleRad)
      const corners = [
        { x: 0, y: 0 },
        { x: W, y: 0 },
        { x: 0, y: H },
        { x: W, y: H },
      ]
      let mn = Infinity
      let mx = -Infinity
      for (const c of corners) {
        const t = c.x * gdx + c.y * gdy
        if (t < mn) mn = t
        if (t > mx) mx = t
      }
      const span = Math.max(1e-3, mx - mn)
      const segCount = gradStops.length - 1

      for (const p of particles) {
        if (!p.alive) continue
        let alpha = 1
        let size = PARTICLE_SIZE
        if (p.type === "burst") {
          const age = now - p.bornAt
          alpha = Math.max(0, 1 - age / p.lifeMs)
          size = PARTICLE_SIZE * (0.8 + alpha * 0.6)
        }
        /** Per-particle gradient colour based on current x,y. */
        const proj = p.x * gdx + p.y * gdy
        let t = (proj - mn) / span
        if (t < 0) t = 0
        else if (t > 1) t = 1
        const segPos = t * segCount
        let segIdx = Math.floor(segPos)
        if (segIdx >= segCount) segIdx = segCount - 1
        const localT = segPos - segIdx
        const c1 = gradStops[segIdx]!
        const c2 = gradStops[segIdx + 1]!
        const r = Math.round(c1[0]! + (c2[0]! - c1[0]!) * localT)
        const g = Math.round(c1[1]! + (c2[1]! - c1[1]!) * localT)
        const b = Math.round(c1[2]! + (c2[2]! - c1[2]!) * localT)
        ctx.fillStyle =
          alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`
        ctx.fillRect(p.x - size * 0.5, p.y - size * 0.5, size, size)
      }

      /** Snapshot for next frame's diff. Deep-clone is unnecessary — board is
       * replaced wholesale by reducer on each change, so reference identity works. */
      prevRef.current = {
        display: dispNow,
        board: brdNow,
        active: actNow,
        lines: linesNow,
      }
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerleave", onPointerLeave)
    }
  }, [containerRef])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10"
      aria-hidden
    />
  )
}

