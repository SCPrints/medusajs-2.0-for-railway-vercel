"use client"

import { useEffect, useRef } from "react"

import {
  parseHexColor,
  WORDMARK_GRADIENT,
} from "@modules/common/lib/wordmark-gradient"

const BOARD_W = 10
const BOARD_H = 20

/** Ambient particles per cell — fixed homes covering the entire board. Filled cells
 * act as obstacles pushing them outward; empty cells let them rest. 400 × 200 cells
 * = 80 000 ambient particles. Stored in typed arrays + rendered via putImageData. */
const AMBIENT_PER_CELL = 400
/** Burst pool capacity (transient one-shot particles for lock/clear effects). */
const MAX_BURST_PARTICLES = 6000
/** Particles spawned per cell when the active piece locks. */
const LOCK_BURST_PER_CELL = 36
/** Particles spawned per cell when a line is cleared. */
const CLEAR_BURST_PER_CELL = 60
/** Burst lifetime (ms). */
const BURST_LIFE_MS = 1100
/** Spring stiffness pulling ambient particles back to home each frame. */
const HOME_SPRING = 0.04
/** Friction multiplier for ambient particles. */
const HOME_FRICTION = 0.9
/** Radius (in cell units) of the obstacle force around each filled cell. */
const OBSTACLE_RADIUS_CELLS = 0.65
/** Force magnitude pushing particles out of filled cells. */
const OBSTACLE_FORCE = 4.2
/** Burst initial speed (CSS px / frame). */
const LOCK_BURST_SPEED = 7
const CLEAR_BURST_SPEED = 10
/** Active-piece movement transition (ms). Lerps the obstacle position smoothly
 * between integer cell positions so the block doesn't snap chunky-style each drop.
 * Tuned just under the default drop interval (700ms) so motion is fluid edge-to-edge. */
const PIECE_TRANSITION_MS = 650
/** Cap on visual lag distance (in cells). Hard drops would otherwise leave a
 * 20-cell trail; we clamp so it caps out at ~1 cell of smoothing slack. */
const PIECE_MAX_LAG_CELLS = 1.2
/** Block "blob": render each filled cell as a dense cluster of coloured particles
 * instead of a solid rect. Higher = denser/more solid blob. */
const BLOCK_PARTICLES_PER_CELL = 110
/** Block particles' jitter spread inside a cell (fraction of cell size). */
const BLOCK_JITTER_FRAC = 0.46
/** Water-drop ripple: radial wave expanding outward from the impact point on lock.
 * Pushes particles radially outward with amplitude that decays with distance. */
const RIPPLE_SPEED = 11
const RIPPLE_BAND_HALF = 24
const RIPPLE_AMPLITUDE = 9
const RIPPLE_AMPLITUDE_DECAY = 0.985
const RIPPLE_MIN_AMPLITUDE = 0.2
/** Upward bias for ripple — water drops mostly affect the surface above impact. */
const RIPPLE_UPWARD_BIAS = 1.4
/** Line-clear flash: horizontal stripe over the cleared row that fades over time. */
const FLASH_LIFE_MS = 480
/** Excitement decay per frame (multiplicative). */
const EXCITEMENT_DECAY = 0.96
/** Line-clear shockwave: initial downward impulse on cleared row, then an upward
 * travelling band that pushes particles upward as it rises through the board. */
const LINE_CLEAR_FALL_IMPULSE = 5
/** Wave upward speed (CSS px / frame) — negative because canvas Y is downward. */
const WAVE_SPEED = -9
/** Wave amplitude (impulse strength at band centre). */
const WAVE_STRENGTH = 4
/** Decay of wave strength per frame. Wave dies before reaching the top edge if
 * board is short — and amplitude tapers naturally. */
const WAVE_DECAY = 0.985
/** Half-height of the wave's effect band (CSS px). Wider band = larger ripple. */
const WAVE_BAND_HALF = 22

/** Per-piece-type RGB palette used to render the active piece on canvas (where it
 * can be smoothly interpolated between drop ticks). Roughly matches the DOM palette
 * but uses concrete RGB so we can write directly to the pixel buffer. */
const PIECE_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [61, 207, 194], // I — teal (brand-accent)
  [255, 46, 99], // O — magenta (brand-secondary)
  [181, 86, 255], // T — violet
  [69, 164, 255], // S — blue
  [255, 193, 69], // Z — yellow
  [193, 255, 69], // J — lime
  [255, 107, 53], // L — orange
]
/** Pre-built gradient lookup table size. */
const GRAD_LUT_SIZE = 512

type Active = { t: number; r: number; x: number; y: number }
type Display = number[][]
type Board = number[][]

type Burst = {
  alive: boolean
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

    /** ============ Ambient particle state (struct of arrays) ============
     * Particles are stored in cell-indexed buckets implicit in the array order:
     * cell (bx, by) owns indices [(bx + by*BOARD_W) * AMBIENT_PER_CELL,
     * +AMBIENT_PER_CELL). Obstacle force only iterates the 9 cells in the obstacle's
     * neighbourhood instead of all 200k particles. */
    const TOTAL_AMBIENT = BOARD_W * BOARD_H * AMBIENT_PER_CELL
    const amb = {
      hx: new Float32Array(TOTAL_AMBIENT),
      hy: new Float32Array(TOTAL_AMBIENT),
      x: new Float32Array(TOTAL_AMBIENT),
      y: new Float32Array(TOTAL_AMBIENT),
      vx: new Float32Array(TOTAL_AMBIENT),
      vy: new Float32Array(TOTAL_AMBIENT),
      excitement: new Float32Array(TOTAL_AMBIENT),
    }

    /** Burst particles: object-array, size-capped pool with linear scan for free slots. */
    const bursts: Burst[] = []
    /** Active line-clear waves: each travels upward through the particle field after
     * a row is cleared, displacing particles as it passes. Multiple waves can coexist
     * if several lines clear in quick succession. */
    const waves: Array<{ y: number; strength: number }> = []
    /** Water-drop ripples: radial bands expanding outward from a lock impact point.
     * Multiple ripples can coexist (one per locked piece) — they layer naturally. */
    const ripples: Array<{
      cx: number
      cy: number
      radius: number
      amplitude: number
    }> = []
    /** Line-clear flash bands: bright horizontal stripes drawn over the cleared row,
     * fading over FLASH_LIFE_MS. Drawn directly to pixBuf each frame. */
    const flashes: Array<{ y: number; bornAt: number }> = []
    const allocateBurst = (): Burst | null => {
      for (let i = 0; i < bursts.length; i++) {
        const p = bursts[i]!
        if (!p.alive) return p
      }
      if (bursts.length >= MAX_BURST_PARTICLES) return null
      const fresh: Burst = {
        alive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        bornAt: 0,
        lifeMs: 0,
      }
      bursts.push(fresh)
      return fresh
    }

    /** ============ Pre-computed gradient lookup table ============
     * 512-entry table of [r,g,b] for fast colour lookup per pixel during render.
     * Built once from WORDMARK_GRADIENT.stops; indexed by t∈[0,1] floor(t * 511). */
    const gradStops = WORDMARK_GRADIENT.stops.map(parseHexColor)
    const gradLutR = new Uint8ClampedArray(GRAD_LUT_SIZE)
    const gradLutG = new Uint8ClampedArray(GRAD_LUT_SIZE)
    const gradLutB = new Uint8ClampedArray(GRAD_LUT_SIZE)
    {
      const segCount = gradStops.length - 1
      for (let i = 0; i < GRAD_LUT_SIZE; i++) {
        const t = i / (GRAD_LUT_SIZE - 1)
        const segPos = t * segCount
        let segIdx = Math.floor(segPos)
        if (segIdx >= segCount) segIdx = segCount - 1
        const localT = segPos - segIdx
        const c1 = gradStops[segIdx]!
        const c2 = gradStops[segIdx + 1]!
        gradLutR[i] = Math.round(c1[0]! + (c2[0]! - c1[0]!) * localT)
        gradLutG[i] = Math.round(c1[1]! + (c2[1]! - c1[1]!) * localT)
        gradLutB[i] = Math.round(c1[2]! + (c2[2]! - c1[2]!) * localT)
      }
    }

    /** Smooth-motion state for the active piece. */
    const pieceMotion = {
      offsetX: 0,
      offsetY: 0,
      transitionStartedAt: -1,
      lastPieceType: -1,
      lastCentroidX: 0,
      lastCentroidY: 0,
    }

    /** Pixel buffer for direct-write rendering. Reallocated on resize. */
    let imageData: ImageData | null = null
    let pixBuf: Uint8ClampedArray | null = null

    const cellCentre = (bx: number, by: number): { x: number; y: number } => ({
      x: sizeState.padX + (bx + 0.5) * sizeState.cellW,
      y: sizeState.padY + (by + 0.5) * sizeState.cellH,
    })

    /** Allocate ambient particles in cell-bucketed order. Each cell owns AMBIENT_PER_CELL
     * consecutive indices, enabling fast obstacle-neighbourhood iteration. */
    const buildAmbient = () => {
      let idx = 0
      for (let by = 0; by < BOARD_H; by++) {
        for (let bx = 0; bx < BOARD_W; bx++) {
          const cellOriginX = sizeState.padX + bx * sizeState.cellW
          const cellOriginY = sizeState.padY + by * sizeState.cellH
          const w = sizeState.cellW
          const h = sizeState.cellH
          for (let s = 0; s < AMBIENT_PER_CELL; s++) {
            /** Random homes within the cell (fully fill the cell, slight margin). */
            const u = hash01(bx * 31 + by, s * 7 + 1)
            const v = hash01(bx * 31 + by, s * 7 + 2)
            const hx = cellOriginX + u * w
            const hy = cellOriginY + v * h
            amb.hx[idx] = hx
            amb.hy[idx] = hy
            amb.x[idx] = hx
            amb.y[idx] = hy
            amb.vx[idx] = 0
            amb.vy[idx] = 0
            amb.excitement[idx] = 0
            idx++
          }
        }
      }
    }

    const spawnBurst = (
      cx: number,
      cy: number,
      count: number,
      speedMax: number,
      lifeMs: number = BURST_LIFE_MS
    ) => {
      const now = performance.now()
      for (let i = 0; i < count; i++) {
        const p = allocateBurst()
        if (!p) return
        p.alive = true
        const angle = Math.random() * Math.PI * 2
        const speed = speedMax * (0.35 + 0.65 * Math.random())
        p.x = cx + (Math.random() - 0.5) * sizeState.cellW * 0.5
        p.y = cy + (Math.random() - 0.5) * sizeState.cellH * 0.5
        p.vx = Math.cos(angle) * speed
        p.vy = Math.sin(angle) * speed
        p.bornAt = now
        p.lifeMs = lifeMs * (0.7 + 0.6 * Math.random())
      }
    }

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
      /** Defensive: skip layout while the container hasn't been measured yet. The
       * ResizeObserver will fire again when valid dimensions arrive. */
      if (rect.width < 4 || rect.height < 4) return
      sizeState.cssW = rect.width
      sizeState.cssH = rect.height
      const gap = 1
      const pad = 4
      sizeState.padX = pad
      sizeState.padY = pad
      sizeState.cellW = (rect.width - pad * 2 - gap * (BOARD_W - 1)) / BOARD_W + gap
      sizeState.cellH = (rect.height - pad * 2 - gap * (BOARD_H - 1)) / BOARD_H + gap
      const W = Math.max(1, Math.round(rect.width * dpr))
      const H = Math.max(1, Math.round(rect.height * dpr))
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      imageData = ctx.createImageData(W, H)
      pixBuf = imageData.data
      buildAmbient()
    }

    layoutCanvas()
    const ro = new ResizeObserver(() => layoutCanvas())
    ro.observe(container)

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const W = sizeState.cssW
      const H = sizeState.cssH
      if (W < 2 || H < 2 || pixBuf == null || imageData == null) return
      const now = performance.now()

      const { display: dispNow, board: brdNow, active: actNow, lines: linesNow } =
        propsRef.current
      const prev = prevRef.current

      /** =========== Lock + line clear event detection =========== */

      if (linesNow > prev.lines) {
        for (let by = 0; by < BOARD_H; by++) {
          const wasFull =
            prev.board[by] != null &&
            prev.board[by]!.every((c) => c !== 0)
          if (!wasFull) continue
          const rowMidY = sizeState.padY + (by + 0.5) * sizeState.cellH
          /** Per-cell big burst at every cell of the cleared row, doubled for drama. */
          for (let bx = 0; bx < BOARD_W; bx++) {
            const c = cellCentre(bx, by)
            spawnBurst(
              c.x,
              c.y,
              CLEAR_BURST_PER_CELL * 2,
              CLEAR_BURST_SPEED * 1.3,
              BURST_LIFE_MS * 1.6
            )
          }
          /** Bright horizontal sweep ribbons in BOTH directions across the full row. */
          const rowSweepCount = 160
          for (let i = 0; i < rowSweepCount; i++) {
            const p = allocateBurst()
            if (!p) break
            p.alive = true
            const fromLeft = i % 2 === 0
            const startX = fromLeft ? sizeState.padX : sizeState.padX + W
            p.x = startX
            p.y = rowMidY + (Math.random() - 0.5) * sizeState.cellH * 0.8
            const dir = fromLeft ? 1 : -1
            p.vx = dir * (10 + Math.random() * 9)
            p.vy = (Math.random() - 0.5) * 3
            p.bornAt = now
            p.lifeMs = 700 + Math.random() * 500
          }
          /** Vertical column blasts: shoot particles up AND down from the cleared
           * row at every column (the row "exploding" along the vertical axis). */
          for (let bx = 0; bx < BOARD_W; bx++) {
            const cellCx = sizeState.padX + (bx + 0.5) * sizeState.cellW
            for (let dirSign = -1; dirSign <= 1; dirSign += 2) {
              for (let i = 0; i < 14; i++) {
                const p = allocateBurst()
                if (!p) break
                p.alive = true
                p.x = cellCx + (Math.random() - 0.5) * sizeState.cellW * 0.7
                p.y = rowMidY + (Math.random() - 0.5) * sizeState.cellH * 0.4
                p.vx = (Math.random() - 0.5) * 4
                p.vy = dirSign * (6 + Math.random() * 6)
                p.bornAt = now
                p.lifeMs = 800 + Math.random() * 400
              }
            }
          }
          /** Initial downward impulse on the cleared row + the row below. */
          const rowsToHit = [by, Math.min(BOARD_H - 1, by + 1)]
          for (const ry of rowsToHit) {
            for (let bx = 0; bx < BOARD_W; bx++) {
              const startIdx = (bx + ry * BOARD_W) * AMBIENT_PER_CELL
              const endIdx = startIdx + AMBIENT_PER_CELL
              for (let i = startIdx; i < endIdx; i++) {
                amb.vy[i] = (amb.vy[i] ?? 0) + LINE_CLEAR_FALL_IMPULSE * 1.4
                amb.excitement[i] = 1
              }
            }
          }
          /** Upward wave + flash band over the cleared row. */
          waves.push({ y: rowMidY, strength: WAVE_STRENGTH * 1.6 })
          flashes.push({ y: rowMidY, bornAt: now })
        }
      }

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
        /** Impact centroid sits at the BOTTOM of the locked block (bottom-most row's
         * lower edge) — that's where a water drop "lands" before the ripple radiates. */
        let cx = 0
        let maxBy = -1
        for (const c of lockedCells) {
          cx += sizeState.padX + (c.bx + 0.5) * sizeState.cellW
          if (c.by > maxBy) maxBy = c.by
        }
        cx /= lockedCells.length
        const cy = sizeState.padY + (maxBy + 1) * sizeState.cellH
        /** Water-drop ripple: radial wave expanding outward from impact. Particles
         * encountered by the wave's band get a radial impulse outward (with upward
         * bias since the surface is below). */
        ripples.push({
          cx,
          cy,
          radius: 0,
          amplitude: RIPPLE_AMPLITUDE,
        })
        /** Plus a quick directional ring burst right at impact for visual punch. */
        const ringCount = 48
        for (let i = 0; i < ringCount; i++) {
          const p = allocateBurst()
          if (!p) break
          p.alive = true
          /** Bias the ring upward (angles from -π to 0 sweep the upper hemisphere). */
          const angle = -Math.PI + (i / ringCount) * Math.PI
          const speed = 10 + Math.random() * 4
          p.x = cx
          p.y = cy
          p.vx = Math.cos(angle) * speed
          p.vy = Math.sin(angle) * speed
          p.bornAt = now
          p.lifeMs = 700 + Math.random() * 300
        }
      }

      /** =========== Smooth active-piece motion =========== */

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
          /** Big-jump detection: if centroid moved more than 4 cells in one
           * frame this isn't a normal step — most likely a hard drop or a new
           * piece sharing the previous type. Skip the transition so the block
           * doesn't streak across the board. */
          const dxJump = activeCentroidX - pieceMotion.lastCentroidX
          const dyJump = activeCentroidY - pieceMotion.lastCentroidY
          const jumpDist = Math.hypot(dxJump, dyJump)
          const cellDiag = Math.hypot(sizeState.cellW, sizeState.cellH)
          if (jumpDist > cellDiag * 4) {
            pieceMotion.offsetX = 0
            pieceMotion.offsetY = 0
            pieceMotion.transitionStartedAt = -1
          } else {
            pieceMotion.offsetX += pieceMotion.lastCentroidX - activeCentroidX
            pieceMotion.offsetY += pieceMotion.lastCentroidY - activeCentroidY
            pieceMotion.transitionStartedAt = now
          }
        } else if (!sameType) {
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

      /** Clamp accumulated offset so hard drops (10+ cell jumps) don't cause the
       * block to slide a huge distance. Cap the visual lag at ~1.2 cells. */
      {
        const maxLag =
          Math.max(sizeState.cellW, sizeState.cellH) * PIECE_MAX_LAG_CELLS
        const offLen = Math.hypot(pieceMotion.offsetX, pieceMotion.offsetY)
        if (offLen > maxLag) {
          const scale = maxLag / offLen
          pieceMotion.offsetX *= scale
          pieceMotion.offsetY *= scale
        }
      }

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
          const remaining = (1 - u) * (1 - u) * (1 - u)
          smoothOffsetX = pieceMotion.offsetX * remaining
          smoothOffsetY = pieceMotion.offsetY * remaining
        }
      }

      /** =========== Build obstacle list =========== */

      type Obstacle = { cx: number; cy: number; bx: number; by: number }
      const obstacles: Obstacle[] = []
      for (let by = 0; by < BOARD_H; by++) {
        for (let bx = 0; bx < BOARD_W; bx++) {
          if (brdNow[by]?.[bx] !== 0) {
            const c = cellCentre(bx, by)
            obstacles.push({ cx: c.x, cy: c.y, bx, by })
          }
        }
      }
      for (const ac of activeCellsForMotion) {
        const c = cellCentre(ac.bx, ac.by)
        obstacles.push({
          cx: c.x + smoothOffsetX,
          cy: c.y + smoothOffsetY,
          bx: ac.bx,
          by: ac.by,
        })
      }
      const obstacleR =
        Math.max(sizeState.cellW, sizeState.cellH) * OBSTACLE_RADIUS_CELLS
      const obstacleR2 = obstacleR * obstacleR

      /** =========== Apply obstacle forces (cell-neighbourhood only) =========== */

      for (let oi = 0; oi < obstacles.length; oi++) {
        const o = obstacles[oi]!
        for (let dy = -1; dy <= 1; dy++) {
          const ny = o.by + dy
          if (ny < 0 || ny >= BOARD_H) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx = o.bx + dx
            if (nx < 0 || nx >= BOARD_W) continue
            const startIdx = (nx + ny * BOARD_W) * AMBIENT_PER_CELL
            const endIdx = startIdx + AMBIENT_PER_CELL
            for (let i = startIdx; i < endIdx; i++) {
              const ddx = amb.x[i]! - o.cx
              const ddy = amb.y[i]! - o.cy
              if (ddx > obstacleR || ddx < -obstacleR) continue
              if (ddy > obstacleR || ddy < -obstacleR) continue
              const dd2 = ddx * ddx + ddy * ddy
              if (dd2 >= obstacleR2 || dd2 < 0.5) continue
              const dd = Math.sqrt(dd2)
              const fall = (obstacleR - dd) / obstacleR
              const f = OBSTACLE_FORCE * fall * fall
              amb.vx[i] = amb.vx[i]! + (ddx / dd) * f
              amb.vy[i] = amb.vy[i]! + (ddy / dd) * f
              if (fall > amb.excitement[i]!) amb.excitement[i] = fall
            }
          }
        }
      }

      /** =========== Wave forces (line-clear shockwaves travelling upward) =========== */

      /** Update each wave's position, decay strength, and apply impulse to particles
       * in its band. Iterate only the row buckets within the band — not all 200k. */
      for (let wi = waves.length - 1; wi >= 0; wi--) {
        const w = waves[wi]!
        /** Determine which board rows fall within the wave's band. */
        const minY = w.y - WAVE_BAND_HALF
        const maxY = w.y + WAVE_BAND_HALF
        const minBy = Math.max(
          0,
          Math.floor((minY - sizeState.padY) / sizeState.cellH)
        )
        const maxBy = Math.min(
          BOARD_H - 1,
          Math.ceil((maxY - sizeState.padY) / sizeState.cellH)
        )
        if (minBy <= maxBy) {
          for (let by = minBy; by <= maxBy; by++) {
            const rowStart = (by * BOARD_W) * AMBIENT_PER_CELL
            const rowEnd = rowStart + BOARD_W * AMBIENT_PER_CELL
            for (let i = rowStart; i < rowEnd; i++) {
              const dy = amb.y[i]! - w.y
              if (dy > WAVE_BAND_HALF || dy < -WAVE_BAND_HALF) continue
              const fall = 1 - Math.abs(dy) / WAVE_BAND_HALF
              const fallSq = fall * fall
              /** Push upward (negative Y in canvas coords). */
              amb.vy[i] = amb.vy[i]! + -w.strength * fallSq
              if (fallSq > amb.excitement[i]!) amb.excitement[i] = fallSq
            }
          }
        }
        /** Move wave upward and decay. */
        w.y += WAVE_SPEED
        w.strength *= WAVE_DECAY
        /** Retire when off the top of the board or strength is negligible. */
        if (w.y < -WAVE_BAND_HALF || w.strength < 0.15) {
          waves.splice(wi, 1)
        }
      }

      /** =========== Water-drop ripples (radial wave from lock impact) =========== */

      /** For each ripple, find ambient particles in the (radius ± band) annulus and
       * apply a radial-outward impulse. Decays with distance from impact + over time. */
      for (let ri = ripples.length - 1; ri >= 0; ri--) {
        const r = ripples[ri]!
        const innerR = r.radius - RIPPLE_BAND_HALF
        const outerR = r.radius + RIPPLE_BAND_HALF
        /** Bounding box of cells the band could touch — iterate only those buckets. */
        const minBx = Math.max(
          0,
          Math.floor(
            (r.cx - outerR - sizeState.padX) / sizeState.cellW
          )
        )
        const maxBx = Math.min(
          BOARD_W - 1,
          Math.ceil(
            (r.cx + outerR - sizeState.padX) / sizeState.cellW
          )
        )
        const minBy = Math.max(
          0,
          Math.floor(
            (r.cy - outerR - sizeState.padY) / sizeState.cellH
          )
        )
        const maxBy = Math.min(
          BOARD_H - 1,
          Math.ceil(
            (r.cy + outerR - sizeState.padY) / sizeState.cellH
          )
        )
        if (minBx <= maxBx && minBy <= maxBy) {
          for (let by = minBy; by <= maxBy; by++) {
            for (let bx = minBx; bx <= maxBx; bx++) {
              const startIdx = (bx + by * BOARD_W) * AMBIENT_PER_CELL
              const endIdx = startIdx + AMBIENT_PER_CELL
              for (let i = startIdx; i < endIdx; i++) {
                const dx = amb.x[i]! - r.cx
                const dy = amb.y[i]! - r.cy
                const d2 = dx * dx + dy * dy
                if (d2 < innerR * innerR || d2 > outerR * outerR) continue
                const d = Math.sqrt(d2)
                if (d < 1e-3) continue
                /** Falloff: Gaussian-ish across the band centre + radial decay. */
                const bandPos = (d - r.radius) / RIPPLE_BAND_HALF
                const bandFall = 1 - bandPos * bandPos
                /** Distance decay: 1/sqrt(r) for 2D wave. */
                const distDecay = 1 / Math.sqrt(1 + d / 30)
                const force = r.amplitude * bandFall * distDecay
                /** Radial outward unit vector + upward bias because we're a ripple
                 * on a surface (impact was at bottom — most field is above). */
                const nx = dx / d
                const ny = dy / d
                amb.vx[i] = amb.vx[i]! + nx * force
                amb.vy[i] =
                  amb.vy[i]! +
                  ny * force -
                  Math.max(0, RIPPLE_UPWARD_BIAS * bandFall)
                if (bandFall > amb.excitement[i]!)
                  amb.excitement[i] = bandFall
              }
            }
          }
        }
        /** Advance ripple: expand radius, decay amplitude. Retire when faded. */
        r.radius += RIPPLE_SPEED
        r.amplitude *= RIPPLE_AMPLITUDE_DECAY
        const maxR = Math.hypot(W, H)
        if (r.amplitude < RIPPLE_MIN_AMPLITUDE || r.radius > maxR) {
          ripples.splice(ri, 1)
        }
      }

      /** =========== Spring + integration (all ambient particles) =========== */

      for (let i = 0; i < TOTAL_AMBIENT; i++) {
        amb.excitement[i] = amb.excitement[i]! * EXCITEMENT_DECAY
        const sx = (amb.hx[i]! - amb.x[i]!) * HOME_SPRING
        const sy = (amb.hy[i]! - amb.y[i]!) * HOME_SPRING
        const nvx = (amb.vx[i]! + sx) * HOME_FRICTION
        const nvy = (amb.vy[i]! + sy) * HOME_FRICTION
        amb.vx[i] = nvx
        amb.vy[i] = nvy
        amb.x[i] = amb.x[i]! + nvx
        amb.y[i] = amb.y[i]! + nvy
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

      /** =========== Render via direct pixel buffer =========== */

      /** Clear buffer (zero alpha = transparent → tetris cell bg shows through). */
      pixBuf.fill(0)
      const PW = canvas.width
      const PH = canvas.height

      /** Draw all filled cells (active + locked) as DENSE PARTICLE BLOBS instead of
       * solid rectangles. Each cell renders BLOCK_PARTICLES_PER_CELL coloured
       * pixels at deterministic jitter positions inside the cell — reads as a
       * "blob of colour" flowing through the field, with subpixel-fuzzy edges
       * that move smoothly with the active piece's interpolated position. */
      const blockJitterW = sizeState.cellW * BLOCK_JITTER_FRAC
      const blockJitterH = sizeState.cellH * BLOCK_JITTER_FRAC
      const renderBlockBlob = (
        cssX: number,
        cssY: number,
        pr: number,
        pg: number,
        pb: number,
        seedA: number
      ) => {
        for (let s = 0; s < BLOCK_PARTICLES_PER_CELL; s++) {
          const u = hash01(seedA, s * 13 + 1) * 2 - 1
          const v = hash01(seedA, s * 13 + 2) * 2 - 1
          const x = cssX + u * blockJitterW
          const y = cssY + v * blockJitterH
          const px = (x * dpr) | 0
          const py = (y * dpr) | 0
          if (px < 0 || px + 1 >= PW || py < 0 || py + 1 >= PH) continue
          /** 2×2 splat per particle so the blob reads dense at typical DPR. */
          for (let dy = 0; dy < 2; dy++) {
            const rowOff = (py + dy) * PW * 4
            for (let dx = 0; dx < 2; dx++) {
              const off = rowOff + (px + dx) * 4
              pixBuf[off] = pr
              pixBuf[off + 1] = pg
              pixBuf[off + 2] = pb
              pixBuf[off + 3] = 255
            }
          }
        }
      }

      /** Locked cells: stable jitter seeded by board coords so the blob doesn't
       * shimmer between frames. */
      for (let by = 0; by < BOARD_H; by++) {
        for (let bx = 0; bx < BOARD_W; bx++) {
          const v = brdNow[by]?.[bx] ?? 0
          if (v === 0) continue
          const colour = PIECE_RGB[v - 1] ?? [255, 255, 255]
          const c = cellCentre(bx, by)
          renderBlockBlob(
            c.x,
            c.y,
            colour[0]!,
            colour[1]!,
            colour[2]!,
            bx * 1009 + by * 17 + 1
          )
        }
      }
      /** Active piece: stable jitter seeded by within-piece cell index so the blob
       * pattern stays the same as the piece moves/rotates. Position uses the
       * smoothly-interpolated offset for fluid motion. */
      if (actNow != null) {
        const colour = PIECE_RGB[actNow.t] ?? [255, 255, 255]
        for (let aci = 0; aci < activeCellsForMotion.length; aci++) {
          const ac = activeCellsForMotion[aci]!
          const c = cellCentre(ac.bx, ac.by)
          renderBlockBlob(
            c.x + smoothOffsetX,
            c.y + smoothOffsetY,
            colour[0]!,
            colour[1]!,
            colour[2]!,
            900000 + aci * 31
          )
        }
      }

      /** Gradient axis vector. */
      const angleRad = (WORDMARK_GRADIENT.angleDeg * Math.PI) / 180
      const gdx = Math.sin(angleRad)
      const gdy = -Math.cos(angleRad)
      /** Project canvas corners (CSS px) onto axis to compute extents. */
      let mn = Infinity
      let mx = -Infinity
      const corners = [
        [0, 0],
        [W, 0],
        [0, H],
        [W, H],
      ]
      for (const c of corners) {
        const t = c[0]! * gdx + c[1]! * gdy
        if (t < mn) mn = t
        if (t > mx) mx = t
      }
      const span = Math.max(1e-3, mx - mn)
      const lutMaxIdx = GRAD_LUT_SIZE - 1

      /** Build filled-cell mask for the render pass: any particle whose current
       * position falls inside a filled cell is hidden so it can't appear ON TOP
       * of the locked block (the block is opaque — particles belong outside it). */
      const filledMask = new Uint8Array(BOARD_W * BOARD_H)
      for (let by = 0; by < BOARD_H; by++) {
        for (let bx = 0; bx < BOARD_W; bx++) {
          if (dispNow[by]?.[bx] !== 0) {
            filledMask[bx + by * BOARD_W] = 1
          }
        }
      }
      const padXL = sizeState.padX
      const padYL = sizeState.padY
      const cellWL = sizeState.cellW
      const cellHL = sizeState.cellH

      /** Ambient pass — write 1 pixel per particle. */
      for (let i = 0; i < TOTAL_AMBIENT; i++) {
        const x = amb.x[i]!
        const y = amb.y[i]!
        /** Skip if this particle is currently inside a filled cell (locked or
         * active). Without this, particles render on top of the opaque block. */
        const cbx = ((x - padXL) / cellWL) | 0
        const cby = ((y - padYL) / cellHL) | 0
        if (
          cbx >= 0 &&
          cbx < BOARD_W &&
          cby >= 0 &&
          cby < BOARD_H &&
          filledMask[cbx + cby * BOARD_W] === 1
        ) {
          continue
        }
        const px = (x * dpr) | 0
        const py = (y * dpr) | 0
        if (px < 0 || px >= PW || py < 0 || py >= PH) continue
        const proj = x * gdx + y * gdy
        let t = (proj - mn) / span
        if (t < 0) t = 0
        else if (t > 1) t = 1
        const lutIdx = (t * lutMaxIdx) | 0
        let r = gradLutR[lutIdx]!
        let g = gradLutG[lutIdx]!
        let b = gradLutB[lutIdx]!
        const exc = amb.excitement[i]!
        if (exc > 0) {
          const k = exc < 0.85 ? exc : 0.85
          r = (r + (255 - r) * k) | 0
          g = (g + (255 - g) * k) | 0
          b = (b + (255 - b) * k) | 0
        }
        const off = (py * PW + px) * 4
        pixBuf[off] = r
        pixBuf[off + 1] = g
        pixBuf[off + 2] = b
        pixBuf[off + 3] = 255
      }

      /** Burst pass — 2×2 splat per particle so they read brighter than ambient. */
      for (let i = 0; i < bursts.length; i++) {
        const p = bursts[i]!
        if (!p.alive) continue
        const age = now - p.bornAt
        const a = Math.max(0, 1 - age / p.lifeMs)
        if (a <= 0.05) continue
        const proj = p.x * gdx + p.y * gdy
        let t = (proj - mn) / span
        if (t < 0) t = 0
        else if (t > 1) t = 1
        const lutIdx = (t * lutMaxIdx) | 0
        let r = gradLutR[lutIdx]!
        let g = gradLutG[lutIdx]!
        let b = gradLutB[lutIdx]!
        /** Bursts ride at high excitement initially, fading. */
        const k = a * 0.85
        r = (r + (255 - r) * k) | 0
        g = (g + (255 - g) * k) | 0
        b = (b + (255 - b) * k) | 0
        const al = (a * 255) | 0
        const px0 = (p.x * dpr) | 0
        const py0 = (p.y * dpr) | 0
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const px = px0 + dx
            const py = py0 + dy
            if (px < 0 || px >= PW || py < 0 || py >= PH) continue
            const off = (py * PW + px) * 4
            pixBuf[off] = r
            pixBuf[off + 1] = g
            pixBuf[off + 2] = b
            pixBuf[off + 3] = al
          }
        }
      }

      /** Line-clear flash: bright horizontal stripe over the cleared row that fades
       * with cubic ease-out. Drawn additively so the row reads as a quick burst of
       * brilliance before fading to dark. */
      for (let fi = flashes.length - 1; fi >= 0; fi--) {
        const fl = flashes[fi]!
        const age = now - fl.bornAt
        if (age >= FLASH_LIFE_MS) {
          flashes.splice(fi, 1)
          continue
        }
        const u = age / FLASH_LIFE_MS
        const a = (1 - u) * (1 - u) * (1 - u)
        const halfBandPx = (sizeState.cellH * 0.6) * dpr
        const cyPx = (fl.y * dpr) | 0
        const y0 = Math.max(0, cyPx - (halfBandPx | 0))
        const y1 = Math.min(PH, cyPx + (halfBandPx | 0))
        for (let py = y0; py < y1; py++) {
          /** Fade vertically away from the band centre too. */
          const vDist = Math.abs(py - cyPx) / halfBandPx
          const vFall = 1 - vDist * vDist
          const aa = a * vFall * 240
          if (aa < 8) continue
          const rowOff = py * PW * 4
          for (let px = 0; px < PW; px++) {
            const off = rowOff + px * 4
            /** Additive blend toward white over the existing pixel. */
            const cur = pixBuf[off + 3]!
            if (cur < aa) {
              const k = aa / 255
              pixBuf[off] = (pixBuf[off]! + (255 - pixBuf[off]!) * k) | 0
              pixBuf[off + 1] =
                (pixBuf[off + 1]! + (255 - pixBuf[off + 1]!) * k) | 0
              pixBuf[off + 2] =
                (pixBuf[off + 2]! + (255 - pixBuf[off + 2]!) * k) | 0
              pixBuf[off + 3] = aa | 0
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)

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
