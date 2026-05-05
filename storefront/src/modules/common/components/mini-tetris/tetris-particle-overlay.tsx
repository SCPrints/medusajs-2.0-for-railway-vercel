"use client"

import { useEffect, useRef } from "react"

import {
  parseHexColor,
  WORDMARK_GRADIENT,
} from "@modules/common/lib/wordmark-gradient"

const BOARD_W = 10
const BOARD_H = 20

/** Ambient particles per cell — these have fixed home positions covering the entire
 * board. Filled cells act as obstacles pushing them outward; empty cells let them rest.
 * Higher = denser field. 36 × 200 cells = 7200 ambient particles. */
const AMBIENT_PER_CELL = 36
/** Hard cap for safety. */
const MAX_PARTICLES = 22000
/** Particles spawned per cell when the active piece locks. */
const LOCK_BURST_PER_CELL = 36
/** Particles spawned per cell when a line is cleared. */
const CLEAR_BURST_PER_CELL = 60
/** Burst lifetime (ms). */
const BURST_LIFE_MS = 1100
/** Spring stiffness pulling ambient particles back to home each frame. Lower = particles
 * linger after being pushed, leaving visible wakes/trails behind moving blocks. */
const HOME_SPRING = 0.04
/** Friction multiplier for ambient particles. Higher = momentum persists, wakes are
 * longer. */
const HOME_FRICTION = 0.9
/** Cursor disturbance radius (CSS px). */
const CURSOR_RADIUS = 60
/** Peak repel force at cursor centre (CSS px / frame²). */
const CURSOR_FORCE = 4.5
/** Tangential side-swirl force around cursor. */
const CURSOR_SWIRL = 1.2
/** Particle drawn size (CSS px). Kept small — density is controlled by particle
 * count, not pixel size. */
const PARTICLE_SIZE = 1.4
/** Burst initial speed (CSS px / frame). */
const LOCK_BURST_SPEED = 7
const CLEAR_BURST_SPEED = 10
/** Radius (in cell units) of the obstacle force around each filled cell. ≥0.5 covers
 * the cell; >0.5 spills slightly into neighbouring cells, making the push feel softer. */
const OBSTACLE_RADIUS_CELLS = 0.65
/** Force magnitude pushing particles out of filled cells. */
const OBSTACLE_FORCE = 4.2
/** Active-piece movement transition (ms). Lerps the obstacle position smoothly
 * between integer cell positions so the block doesn't snap chunky-style each drop. */
const PIECE_TRANSITION_MS = 180

type Active = { t: number; r: number; x: number; y: number }
type Display = number[][]
type Board = number[][]

type Particle = {
  alive: boolean
  type: "ambient" | "burst"
  /** Sub-jitter index (0..AMBIENT_PER_CELL-1) within the home cell. */
  subIdx: number
  hx: number
  hy: number
  x: number
  y: number
  vx: number
  vy: number
  bornAt: number
  lifeMs: number
  /** 0..1 — bumped when a block obstacle pushes the particle, decays each frame.
   * Renderer blends the particle's gradient colour toward white by this amount,
   * so newly-displaced particles glow bright and fade as they trail/return home. */
  excitement: number
}

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>
  display: Display
  board: Board
  active: Active | null
  lines: number
}

/** Deterministic hash → 0..1, stable per (a, b). */
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
  const propsRef = useRef({ display, board, active, lines })
  propsRef.current = { display, board, active, lines }
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
    const sizeState = {
      cssW: 0,
      cssH: 0,
      cellW: 0,
      cellH: 0,
      padX: 0,
      padY: 0,
    }

    const cursor = {
      x: -1e6,
      y: -1e6,
      prevX: -1e6,
      prevY: -1e6,
      vx: 0,
      vy: 0,
      inside: false,
    }

    /** Ambient particles array — fixed allocation covering the full board grid. */
    const ambient: Particle[] = []
    /** Burst particles — one-shot, recycled when dead. */
    const bursts: Particle[] = []

    /** Smooth-motion state for the active piece. Tracks the offset (in screen px)
     * from the *current* active-piece position to where it visually was a moment
     * ago, so we can interpolate during the PIECE_TRANSITION_MS window after each
     * discrete tetris move/drop tick. */
    const pieceMotion = {
      offsetX: 0,
      offsetY: 0,
      transitionStartedAt: -1,
      lastPieceType: -1,
      lastCentroidX: 0,
      lastCentroidY: 0,
    }

    const gradStops = WORDMARK_GRADIENT.stops.map(parseHexColor)

    /** Compute cell centre in canvas-CSS coords. */
    const cellCentre = (bx: number, by: number): { x: number; y: number } => ({
      x: sizeState.padX + (bx + 0.5) * sizeState.cellW,
      y: sizeState.padY + (by + 0.5) * sizeState.cellH,
    })

    /** Allocate ambient field — 200 cells × AMBIENT_PER_CELL particles, fixed homes. */
    const buildAmbient = () => {
      ambient.length = 0
      for (let by = 0; by < BOARD_H; by++) {
        for (let bx = 0; bx < BOARD_W; bx++) {
          const c = cellCentre(bx, by)
          for (let s = 0; s < AMBIENT_PER_CELL; s++) {
            const ox = (hash01(bx * 31 + by, s * 7 + 1) - 0.5) * sizeState.cellW * 0.85
            const oy = (hash01(bx * 31 + by, s * 7 + 2) - 0.5) * sizeState.cellH * 0.85
            ambient.push({
              alive: true,
              type: "ambient",
              subIdx: s,
              hx: c.x + ox,
              hy: c.y + oy,
              x: c.x + ox,
              y: c.y + oy,
              vx: 0,
              vy: 0,
              bornAt: 0,
              lifeMs: 0,
              excitement: 0,
            })
          }
        }
      }
    }

    const allocateBurst = (): Particle => {
      for (let i = 0; i < bursts.length; i++) {
        const p = bursts[i]!
        if (!p.alive) return p
      }
      const fresh: Particle = {
        alive: false,
        type: "burst",
        subIdx: 0,
        hx: 0,
        hy: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        bornAt: 0,
        lifeMs: 0,
        excitement: 0,
      }
      bursts.push(fresh)
      return fresh
    }

    const spawnBurst = (
      cx: number,
      cy: number,
      count: number,
      speedMax: number,
      lifeMs: number = BURST_LIFE_MS
    ) => {
      const now = performance.now()
      const total = ambient.length + bursts.length
      const budget = Math.max(0, MAX_PARTICLES - total)
      const actual = Math.min(count, budget)
      for (let i = 0; i < actual; i++) {
        const p = allocateBurst()
        p.alive = true
        p.type = "burst"
        const angle = Math.random() * Math.PI * 2
        const speed = speedMax * (0.35 + 0.65 * Math.random())
        p.x = cx + (Math.random() - 0.5) * sizeState.cellW * 0.5
        p.y = cy + (Math.random() - 0.5) * sizeState.cellH * 0.5
        p.hx = p.x
        p.hy = p.y
        p.vx = Math.cos(angle) * speed
        p.vy = Math.sin(angle) * speed
        p.bornAt = now
        p.lifeMs = lifeMs * (0.7 + 0.6 * Math.random())
      }
    }

    /** Active-piece cells derived from display − board. */
    const computeActiveCells = (
      disp: Display,
      brd: Board
    ): Array<{ bx: number; by: number }> => {
      const out: Array<{ bx: number; by: number }> = []
      for (let by = 0; by < BOARD_H; by++) {
        for (let bx = 0; bx < BOARD_W; bx++) {
          if (disp[by]?.[bx] !== 0 && brd[by]?.[bx] === 0) {
            out.push({ bx, by })
            if (out.length >= 4) return out
          }
        }
      }
      return out
    }

    const layoutCanvas = () => {
      const rect = container.getBoundingClientRect()
      sizeState.cssW = rect.width
      sizeState.cssH = rect.height
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
      buildAmbient()
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

      if (cursor.prevX > -1e5) {
        cursor.vx = cursor.x - cursor.prevX
        cursor.vy = cursor.y - cursor.prevY
      }
      cursor.prevX = cursor.x
      cursor.prevY = cursor.y

      const { display: dispNow, board: brdNow, active: actNow, lines: linesNow } =
        propsRef.current
      const prev = prevRef.current

      /** =========== Event detection (lock + line clear) =========== */

      /** Line clears: spawn dramatic horizontal sweep bursts at every cell of the
       * just-cleared rows. Detected by lines counter increase + finding rows of
       * prev.board that were full. */
      if (linesNow > prev.lines) {
        for (let by = 0; by < BOARD_H; by++) {
          const wasFull =
            prev.board[by] != null &&
            prev.board[by]!.every((c) => c !== 0)
          if (!wasFull) continue
          /** Per-cell big burst. */
          for (let bx = 0; bx < BOARD_W; bx++) {
            const c = cellCentre(bx, by)
            spawnBurst(
              c.x,
              c.y,
              CLEAR_BURST_PER_CELL,
              CLEAR_BURST_SPEED,
              BURST_LIFE_MS * 1.4
            )
          }
          /** Plus a horizontal sweep ribbon — a row of fast particles flying
           * outward across the row centre line. */
          const rowMidY = sizeState.padY + (by + 0.5) * sizeState.cellH
          const rowSweepCount = 80
          const total = ambient.length + bursts.length
          const budget = Math.max(0, MAX_PARTICLES - total)
          for (let i = 0; i < Math.min(rowSweepCount, budget); i++) {
            const p = allocateBurst()
            p.alive = true
            p.type = "burst"
            const fromLeft = i % 2 === 0
            const startX = fromLeft ? sizeState.padX : sizeState.padX + W
            p.x = startX
            p.y = rowMidY + (Math.random() - 0.5) * sizeState.cellH * 0.6
            p.hx = p.x
            p.hy = p.y
            const dir = fromLeft ? 1 : -1
            p.vx = dir * (8 + Math.random() * 6)
            p.vy = (Math.random() - 0.5) * 2
            p.bornAt = now
            p.lifeMs = 600 + Math.random() * 400
          }
        }
      }

      /** Lock: prev active-piece cells now in current locked board. Each transition
       * spawns a per-cell burst plus a stronger central pulse at the lock centre. */
      const prevActive = computeActiveCells(prev.display, prev.board)
      const lockedCells: Array<{ bx: number; by: number }> = []
      for (const cell of prevActive) {
        const wasInBoard = prev.board[cell.by]?.[cell.bx] !== 0
        const nowInBoard = brdNow[cell.by]?.[cell.bx] !== 0
        if (!wasInBoard && nowInBoard) {
          lockedCells.push(cell)
          const c = cellCentre(cell.bx, cell.by)
          spawnBurst(c.x, c.y, LOCK_BURST_PER_CELL, LOCK_BURST_SPEED)
        }
      }
      if (lockedCells.length > 0) {
        /** Pulse wave: a ring of fast particles at the centroid of the locked
         * cells, expanding outward — feels like an impact shockwave. */
        let cx = 0
        let cy = 0
        for (const c of lockedCells) {
          const cc = cellCentre(c.bx, c.by)
          cx += cc.x
          cy += cc.y
        }
        cx /= lockedCells.length
        cy /= lockedCells.length
        const ringCount = 36
        const total = ambient.length + bursts.length
        const budget = Math.max(0, MAX_PARTICLES - total)
        for (let i = 0; i < Math.min(ringCount, budget); i++) {
          const p = allocateBurst()
          p.alive = true
          p.type = "burst"
          const angle = (i / ringCount) * Math.PI * 2
          const speed = 9 + Math.random() * 3
          p.x = cx
          p.y = cy
          p.hx = cx
          p.hy = cy
          p.vx = Math.cos(angle) * speed
          p.vy = Math.sin(angle) * speed
          p.bornAt = now
          p.lifeMs = 700 + Math.random() * 300
        }
      }

      /** =========== Smooth active-piece motion =========== */

      /** Compute current active-piece centroid in screen coords. When the active
       * piece's centroid jumps (a discrete tetris move or drop tick), capture the
       * delta as pieceMotion.offsetXY and start a transition timer. The offset then
       * decays to zero over PIECE_TRANSITION_MS, smoothly interpolating the visible
       * obstacle position. Resets cleanly when the piece TYPE changes (new spawn). */
      const activeCellsForMotion = computeActiveCells(dispNow, brdNow)
      let activeCentroidX = 0
      let activeCentroidY = 0
      if (activeCellsForMotion.length > 0) {
        for (const c of activeCellsForMotion) {
          const cc = cellCentre(c.bx, c.by)
          activeCentroidX += cc.x
          activeCentroidY += cc.y
        }
        activeCentroidX /= activeCellsForMotion.length
        activeCentroidY /= activeCellsForMotion.length

        const sameType = actNow != null && actNow.t === pieceMotion.lastPieceType
        if (
          sameType &&
          (activeCentroidX !== pieceMotion.lastCentroidX ||
            activeCentroidY !== pieceMotion.lastCentroidY)
        ) {
          /** Piece moved/rotated/dropped one step. Stash the old position relative
           * to the new one as the starting offset; transition decays it to zero. */
          pieceMotion.offsetX += pieceMotion.lastCentroidX - activeCentroidX
          pieceMotion.offsetY += pieceMotion.lastCentroidY - activeCentroidY
          pieceMotion.transitionStartedAt = now
        } else if (!sameType) {
          /** New piece spawned — no transition. */
          pieceMotion.offsetX = 0
          pieceMotion.offsetY = 0
          pieceMotion.transitionStartedAt = -1
        }
        pieceMotion.lastPieceType = actNow != null ? actNow.t : -1
        pieceMotion.lastCentroidX = activeCentroidX
        pieceMotion.lastCentroidY = activeCentroidY
      } else {
        pieceMotion.lastPieceType = -1
      }

      /** Decay offset toward zero as transition progresses (cubic ease-out). */
      let smoothOffsetX = 0
      let smoothOffsetY = 0
      if (pieceMotion.transitionStartedAt >= 0) {
        const elapsed = now - pieceMotion.transitionStartedAt
        if (elapsed >= PIECE_TRANSITION_MS) {
          pieceMotion.offsetX = 0
          pieceMotion.offsetY = 0
          pieceMotion.transitionStartedAt = -1
        } else {
          const u = elapsed / PIECE_TRANSITION_MS
          /** Ease-out cubic: starts at offset, decays to 0. */
          const remaining = (1 - u) * (1 - u) * (1 - u)
          smoothOffsetX = pieceMotion.offsetX * remaining
          smoothOffsetY = pieceMotion.offsetY * remaining
        }
      }

      /** =========== Build filled-cell obstacle list =========== */

      type Obstacle = { cx: number; cy: number; r: number }
      const obstacles: Obstacle[] = []
      const obstacleR =
        Math.max(sizeState.cellW, sizeState.cellH) * OBSTACLE_RADIUS_CELLS
      /** Locked cells: anchored to grid. */
      for (let by = 0; by < BOARD_H; by++) {
        for (let bx = 0; bx < BOARD_W; bx++) {
          if (brdNow[by]?.[bx] !== 0) {
            const c = cellCentre(bx, by)
            obstacles.push({ cx: c.x, cy: c.y, r: obstacleR })
          }
        }
      }
      /** Active piece cells: shift each by the smoothed offset so the piece appears
       * to glide between drop ticks instead of snapping. */
      for (const ac of activeCellsForMotion) {
        const c = cellCentre(ac.bx, ac.by)
        obstacles.push({
          cx: c.x + smoothOffsetX,
          cy: c.y + smoothOffsetY,
          r: obstacleR,
        })
      }

      /** =========== Ambient physics =========== */

      const cursorX = cursor.x
      const cursorY = cursor.y
      const cursorActive = cursor.inside
      const CR = CURSOR_RADIUS
      const CR2 = CR * CR

      for (let i = 0; i < ambient.length; i++) {
        const p = ambient[i]!
        /** Decay excitement toward zero each frame. Multiplicative fade ⇒
         * exponential decay, ~270ms half-life at 60fps. */
        p.excitement *= 0.96
        /** Filled-cell obstacle push: particles inside any filled cell get pushed
         * radially outward from that cell's centre AND brighten. */
        for (let oi = 0; oi < obstacles.length; oi++) {
          const o = obstacles[oi]!
          const dx = p.x - o.cx
          const dy = p.y - o.cy
          if (Math.abs(dx) > o.r || Math.abs(dy) > o.r) continue
          const d2 = dx * dx + dy * dy
          if (d2 >= o.r * o.r || d2 < 0.5) continue
          const d = Math.sqrt(d2)
          const fall = (o.r - d) / o.r
          const f = OBSTACLE_FORCE * fall * fall
          p.vx += (dx / d) * f
          p.vy += (dy / d) * f
          /** Brightness peaks near the obstacle centre; max-not-add so multiple
           * obstacles overlapping don't run away past 1. */
          if (fall > p.excitement) p.excitement = fall
        }
        /** Cursor disturbance — same radial repel + tangential swirl as SC Prints. */
        if (cursorActive) {
          const dx = p.x - cursorX
          const dy = p.y - cursorY
          const d2 = dx * dx + dy * dy
          if (d2 < CR2 && d2 > 0.5) {
            const d = Math.sqrt(d2)
            const fall = (CR - d) / CR
            const fallSq = fall * fall
            const nx = dx / d
            const ny = dy / d
            p.vx += nx * CURSOR_FORCE * fallSq
            p.vy += ny * CURSOR_FORCE * fallSq
            p.vx += -ny * CURSOR_SWIRL * fallSq
            p.vy += nx * CURSOR_SWIRL * fallSq
          }
        }
        /** Spring back to home + friction. */
        p.vx += (p.hx - p.x) * HOME_SPRING
        p.vy += (p.hy - p.y) * HOME_SPRING
        p.vx *= HOME_FRICTION
        p.vy *= HOME_FRICTION
        p.x += p.vx
        p.y += p.vy
      }

      /** =========== Burst physics =========== */

      for (let i = 0; i < bursts.length; i++) {
        const p = bursts[i]!
        if (!p.alive) continue
        const age = now - p.bornAt
        if (age >= p.lifeMs) {
          p.alive = false
          continue
        }
        p.vx *= 0.93
        p.vy *= 0.93
        p.vy += 0.1
        p.x += p.vx
        p.y += p.vy
      }

      /** =========== Render =========== */

      ctx.clearRect(0, 0, W, H)

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

      const drawParticle = (
        x: number,
        y: number,
        size: number,
        alpha: number,
        excitement: number
      ) => {
        const proj = x * gdx + y * gdy
        let t = (proj - mn) / span
        if (t < 0) t = 0
        else if (t > 1) t = 1
        const segPos = t * segCount
        let segIdx = Math.floor(segPos)
        if (segIdx >= segCount) segIdx = segCount - 1
        const localT = segPos - segIdx
        const c1 = gradStops[segIdx]!
        const c2 = gradStops[segIdx + 1]!
        let r = c1[0]! + (c2[0]! - c1[0]!) * localT
        let g = c1[1]! + (c2[1]! - c1[1]!) * localT
        let b = c1[2]! + (c2[2]! - c1[2]!) * localT
        /** Brighten toward white based on excitement. 0 = pure gradient, 1 = white.
         * Strength capped at 0.85 so a tiny hue tint of the gradient survives. */
        if (excitement > 0) {
          const k = Math.min(0.85, excitement)
          r += (255 - r) * k
          g += (255 - g) * k
          b += (255 - b) * k
        }
        const ri = Math.round(r)
        const gi = Math.round(g)
        const bi = Math.round(b)
        ctx.fillStyle =
          alpha < 1
            ? `rgba(${ri},${gi},${bi},${alpha})`
            : `rgb(${ri},${gi},${bi})`
        ctx.fillRect(x - size * 0.5, y - size * 0.5, size, size)
      }

      for (let i = 0; i < ambient.length; i++) {
        const p = ambient[i]!
        drawParticle(p.x, p.y, PARTICLE_SIZE, 1, p.excitement)
      }
      for (let i = 0; i < bursts.length; i++) {
        const p = bursts[i]!
        if (!p.alive) continue
        const age = now - p.bornAt
        const a = Math.max(0, 1 - age / p.lifeMs)
        const sz = PARTICLE_SIZE * (1.2 + a * 0.8)
        /** Bursts ride at high excitement initially, fading with their alpha. */
        drawParticle(p.x, p.y, sz, a, a * 0.8)
      }

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
