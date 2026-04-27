"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Canvas draw colours — aligned with `globals.css` brand tokens. */
const BUBBLE_COLORS = [
  "#3dcfc2", // accent
  "#ff2e63", // secondary
  "#1a1a2e", // primary
  "#2a9a90", // accent–primary mix
  "#c24d6d", // secondary muted
] as const

const COLOR_COUNT = BUBBLE_COLORS.length
const BUBBLE_R = 15
/** Contact radius: slightly larger than 2*R to forgive edge grazes. */
const HIT_R_MULT = 1.04
const HIT_R2 = (2 * BUBBLE_R * HIT_R_MULT) ** 2
/** Center distance when two bubbles touch. */
const CONTACT_D = 2 * BUBBLE_R * HIT_R_MULT
const STEP = 2 * BUBBLE_R
const ROW_H = BUBBLE_R * Math.sqrt(3)
const CANVAS_W = 360
const CANVAS_H = 520
const CANNON_Y = CANVAS_H - 36
const GRID_TOP = 48
const MAX_ROWS = 14
const FILLED_START_ROWS = 6
const TRAJ_STEPS = 120
/** Micro-moves per animation frame; higher = better segment–circle accuracy. */
const MICROS_PER_FRAME = 64
/** Pixels the shot travels per frame (split across `MICROS_PER_FRAME` steps). */
const SHOT_SPEED = 7.2
const SHOTS_PER_CEILING = 5
const MAX_COL = 8

function colCount(r: number): number {
  return r % 2 === 0 ? 8 : 7
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < MAX_ROWS && c >= 0 && c < colCount(r) && c < MAX_COL
}

type Cell = number | null
type Grid = Cell[][]

function makeEmptyGrid(): Grid {
  return Array.from({ length: MAX_ROWS }, () =>
    Array.from({ length: MAX_COL }, () => null)
  ) as Grid
}

function fillTopRows(g: Grid): void {
  for (let r = 0; r < FILLED_START_ROWS; r++) {
    for (let c = 0; c < colCount(r); c++) {
      g[r]![c] = (Math.random() * COLOR_COUNT) | 0
    }
  }
}

function centerXY(r: number, c: number, w: number, _h: number) {
  const nc = colCount(r)
  const x =
    w / 2 - (nc - 1) * BUBBLE_R + c * STEP + (r % 2) * BUBBLE_R
  const y = GRID_TOP + r * ROW_H
  return { x, y }
}

function boardHasAnyBubble(g: Grid): boolean {
  for (let r = 0; r < MAX_ROWS; r++) {
    for (let c = 0; c < colCount(r); c++) {
      if (g[r]![c] !== null) {
        return true
      }
    }
  }
  return false
}

function rowHasAnyBubble(g: Grid, r: number): boolean {
  for (let c = 0; c < colCount(r); c++) {
    if (g[r]![c] !== null) {
      return true
    }
  }
  return false
}

/** Pushes a new row at the top, shifts the field down; losing row is the bottom. */
function shiftGridDown(g: Grid): "ok" | "gameover" {
  if (rowHasAnyBubble(g, MAX_ROWS - 1)) {
    return "gameover"
  }
  for (let r = MAX_ROWS - 1; r >= 1; r--) {
    for (let c = 0; c < MAX_COL; c++) {
      g[r]![c] = g[r - 1]![c] ?? null
    }
    if (r % 2 === 1) {
      g[r]![7] = null
    }
  }
  for (let c = 0; c < colCount(0); c++) {
    g[0]![c] = (Math.random() * COLOR_COUNT) | 0
  }
  for (let c = colCount(0); c < MAX_COL; c++) {
    g[0]![c] = null
  }
  return "ok"
}

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/**
 * Y coordinate of the topmost edge of the mass (smallest y on screen).
 * For ceiling snap: only when the shot passes *above* this line do we use row-0;
 * a fixed `GRID_TOP` is wrong for bank shots that are still level with the stack.
 */
function topClusterSurfaceY(
  g: Grid,
  w: number,
  h: number
): number | null {
  let minCy = Infinity
  for (let r = 0; r < MAX_ROWS; r++) {
    for (let c = 0; c < colCount(r); c++) {
      if (g[r]![c] === null) {
        continue
      }
      const y = centerXY(r, c, w, h).y
      if (y < minCy) {
        minCy = y
      }
    }
  }
  if (minCy === Infinity) {
    return null
  }
  return minCy - BUBBLE_R
}

type SegHit = { t: number; x: number; y: number }

/**
 * First intersection of segment A→B with a circle of radius r around C
 * (entry from outside, smallest t in (0,1]).
 */
function segmentCircleFirstHit(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number
): SegHit | null {
  const dx = x2 - x1
  const dy = y2 - y1
  const a = dx * dx + dy * dy
  if (a < 1e-10) {
    return null
  }
  const ex = x1 - cx
  const ey = y1 - cy
  const b = 2 * (ex * dx + ey * dy)
  const c = ex * ex + ey * ey - r * r
  const disc = b * b - 4 * a * c
  if (disc < 0) {
    return null
  }
  const s = Math.sqrt(disc)
  const t0 = (-b - s) / (2 * a)
  const t1 = (-b + s) / (2 * a)
  const tCandidates: number[] = []
  for (const t of [t0, t1]) {
    if (t > 0 && t <= 1) {
      tCandidates.push(t)
    }
  }
  if (c <= 0 && tCandidates.length === 0) {
    if (ex * ex + ey * ey <= r * r) {
      return { t: 0, x: x1, y: y1 }
    }
  }
  if (tCandidates.length === 0) {
    return null
  }
  const t = Math.min(...tCandidates)
  return { t, x: x1 + t * dx, y: y1 + t * dy }
}

type BubbleSegHit = { r: number; c: number; t: number; x: number; y: number }

function firstBubbleOnSegment(
  ox: number,
  oy: number,
  nx: number,
  ny: number,
  g: Grid,
  w: number,
  h: number
): BubbleSegHit | null {
  let best: BubbleSegHit | null = null
  for (let r = 0; r < MAX_ROWS; r++) {
    for (let c = 0; c < colCount(r); c++) {
      if (g[r]![c] === null) {
        continue
      }
      const { x: cx, y: cy } = centerXY(r, c, w, h)
      const h2 = segmentCircleFirstHit(ox, oy, nx, ny, cx, cy, CONTACT_D)
      if (!h2) {
        continue
      }
      if (best === null || h2.t < best.t) {
        best = { r, c, t: h2.t, x: h2.x, y: h2.y }
      }
    }
  }
  return best
}

function closestBubbleCenterOverlap(
  x: number,
  y: number,
  g: Grid,
  w: number,
  h: number
): { r: number; c: number; d2: number } | null {
  let best: { r: number; c: number; d2: number } | null = null
  for (let r = 0; r < MAX_ROWS; r++) {
    for (let c = 0; c < colCount(r); c++) {
      if (g[r]![c] === null) {
        continue
      }
      const { x: cx, y: cy } = centerXY(r, c, w, h)
      const d2 = dist2(x, y, cx, cy)
      if (d2 < HIT_R2 && (best === null || d2 < best.d2)) {
        best = { r, c, d2 }
      }
    }
  }
  return best
}

/**
 * All grid slots whose centres are within contact distance of (r, c) — works as hex adjacency.
 */
function neighborsGeom(
  r: number,
  c: number,
  w: number,
  h: number
): { r: number; c: number }[] {
  const p = centerXY(r, c, w, h)
  const out: { r: number; c: number }[] = []
  for (let r2 = 0; r2 < MAX_ROWS; r2++) {
    for (let c2 = 0; c2 < colCount(r2); c2++) {
      if (r2 === r && c2 === c) {
        continue
      }
      const q = centerXY(r2, c2, w, h)
      if (dist2(p.x, p.y, q.x, q.y) < (STEP * 0.98) * (STEP * 0.98)) {
        out.push({ r: r2, c: c2 })
      }
    }
  }
  return out
}

function getEmptyAttachNeighbors(
  r: number,
  c: number,
  g: Grid,
  w: number,
  h: number
): { r: number; c: number }[] {
  return neighborsGeom(r, c, w, h).filter(({ r: r2, c: c2 }) => g[r2]![c2] === null)
}

/** BFS: same-color cluster from (sr, sc), 6-neighbor (geom). */
function sameColorCluster(
  g: Grid,
  sr: number,
  sc: number,
  w: number,
  h: number
): { r: number; c: number }[] {
  const color = g[sr]![sc]!
  const set = new Set<string>()
  const out: { r: number; c: number }[] = []
  const q: { r: number; c: number }[] = [{ r: sr, c: sc }]
  const k = (r: number, c: number) => `${r},${c}`
  set.add(k(sr, sc))
  while (q.length) {
    const cur = q.shift()!
    out.push(cur)
    for (const n of neighborsGeom(cur.r, cur.c, w, h)) {
      if (g[n.r]![n.c] !== color) {
        continue
      }
      const id = k(n.r, n.c)
      if (set.has(id)) {
        continue
      }
      set.add(id)
      q.push(n)
    }
  }
  return out
}

/** Flood: any color, from cells touching the ceiling (row 0). */
function connectedToCeiling(
  g: Grid,
  w: number,
  h: number
): Set<string> {
  const safe = new Set<string>()
  const k = (r: number, c: number) => `${r},${c}`
  const q: { r: number; c: number }[] = []
  for (let c = 0; c < colCount(0); c++) {
    if (g[0]![c] !== null) {
      q.push({ r: 0, c })
      safe.add(k(0, c))
    }
  }
  while (q.length) {
    const { r, c } = q.shift()!
    for (const n of neighborsGeom(r, c, w, h)) {
      if (g[n.r]![n.c] === null) {
        continue
      }
      const id = k(n.r, n.c)
      if (safe.has(id)) {
        continue
      }
      safe.add(id)
      q.push(n)
    }
  }
  return safe
}

function expandSnapCandidates(
  hitR: number,
  hitC: number,
  g: Grid,
  w: number,
  h: number
): { r: number; c: number }[] {
  const k = (r: number, c: number) => `${r},${c}`
  const seen = new Set<string>()
  const out: { r: number; c: number }[] = []
  const add = (r: number, c: number) => {
    if (!inBounds(r, c) || g[r]![c] !== null) {
      return
    }
    const id = k(r, c)
    if (seen.has(id)) {
      return
    }
    seen.add(id)
    out.push({ r, c })
  }
  for (const a of getEmptyAttachNeighbors(hitR, hitC, g, w, h)) {
    add(a.r, a.c)
  }
  for (const n of neighborsGeom(hitR, hitC, w, h)) {
    if (g[n.r]![n.c] === null) {
      continue
    }
    for (const m of getEmptyAttachNeighbors(n.r, n.c, g, w, h)) {
      add(m.r, m.c)
    }
  }
  if (out.length) {
    return out
  }
  for (let r = 0; r < MAX_ROWS; r++) {
    for (let c = 0; c < colCount(r); c++) {
      if (g[r]![c] !== null) {
        continue
      }
      for (const n of neighborsGeom(r, c, w, h)) {
        if (g[n.r]![n.c] !== null) {
          add(r, c)
          break
        }
      }
    }
  }
  return out
}

function pickSnapCell(
  hitR: number,
  hitC: number,
  px: number,
  py: number,
  g: Grid,
  w: number,
  h: number
): { r: number; c: number } | null {
  const cands = expandSnapCandidates(hitR, hitC, g, w, h)
  if (cands.length === 0) {
    return null
  }
  let best = cands[0]!
  let bestD = dist2(
    centerXY(best.r, best.c, w, h).x,
    centerXY(best.r, best.c, w, h).y,
    px,
    py
  )
  for (const s of cands) {
    const p = centerXY(s.r, s.c, w, h)
    const d = dist2(p.x, p.y, px, py)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return { r: best.r, c: best.c }
}

function hasEmptyInRow0(g: Grid): boolean {
  for (let c = 0; c < colCount(0); c++) {
    if (g[0]![c] === null) {
      return true
    }
  }
  return false
}

function firstEmptyTopRow(
  x: number,
  y: number,
  g: Grid,
  w: number,
  h: number
) {
  let best: { c: number } | null = null
  let bestD = Infinity
  for (let c = 0; c < colCount(0); c++) {
    if (g[0]![c] !== null) {
      continue
    }
    const p = centerXY(0, c, w, h)
    const d = dist2(p.x, p.y, x, y)
    if (d < bestD) {
      bestD = d
      best = { c }
    }
  }
  if (!best) {
    return null
  }
  return { r: 0, c: best.c }
}

/** Aim preview: same wall + micro + segment + dynamic ceiling as the live shot. */
function buildAimPoints(
  g: Grid,
  w: number,
  h: number,
  angle: number
): { x: number; y: number }[] {
  const p = {
    x: w / 2,
    y: CANNON_Y,
    vx: Math.sin(angle) * SHOT_SPEED,
    vy: -Math.cos(angle) * SHOT_SPEED,
  }
  const out: { x: number; y: number }[] = [{ x: p.x, y: p.y }]
  let done = false
  outer: for (let f = 0; f < TRAJ_STEPS && !done; f++) {
    for (let m = 0; m < MICROS_PER_FRAME; m++) {
      const ox = p.x
      const oy = p.y
      p.x += p.vx / MICROS_PER_FRAME
      p.y += p.vy / MICROS_PER_FRAME
      if (p.x < BUBBLE_R) {
        p.x = BUBBLE_R
        p.vx *= -1
      }
      if (p.x > w - BUBBLE_R) {
        p.x = w - BUBBLE_R
        p.vx *= -1
      }
      const segHit = firstBubbleOnSegment(ox, oy, p.x, p.y, g, w, h)
      if (segHit) {
        p.x = segHit.x
        p.y = segHit.y
        out.push({ x: segHit.x, y: segHit.y })
        done = true
        break outer
      }
      if (closestBubbleCenterOverlap(p.x, p.y, g, w, h)) {
        out.push({ x: p.x, y: p.y })
        done = true
        break outer
      }
      const skyY = topClusterSurfaceY(g, w, h)
      if (boardHasAnyBubble(g) && skyY !== null) {
        if (p.y < skyY) {
          if (hasEmptyInRow0(g)) {
            const sn = firstEmptyTopRow(p.x, p.y, g, w, h)
            if (sn) {
              const cxy = centerXY(0, sn.c, w, h)
              out.push({ x: cxy.x, y: cxy.y })
              done = true
              break outer
            }
          } else {
            p.y = skyY
            p.vy = Math.abs(p.vy)
          }
        }
      } else {
        if (p.y < GRID_TOP - BUBBLE_R) {
          const sn = firstEmptyTopRow(p.x, p.y, g, w, h)
          if (sn) {
            const cxy = centerXY(0, sn.c, w, h)
            out.push({ x: cxy.x, y: cxy.y })
            done = true
            break outer
          }
          p.y = GRID_TOP - BUBBLE_R
          p.vy = Math.abs(p.vy)
        }
      }
      if (p.y - BUBBLE_R > h) {
        out.push({ x: p.x, y: p.y })
        done = true
        break outer
      }
    }
    if (f % 2 === 0) {
      out.push({ x: p.x, y: p.y })
    }
  }
  return out
}

type Projectile = { x: number; y: number; vx: number; vy: number; color: number }

export default function MiniBubblePop() {
  const ref = useRef<HTMLCanvasElement>(null)
  const aimRef = useRef({ angle: -Math.PI / 2, mouse: { x: 0, y: 0 } })
  const [score, setScore] = useState(0)
  const [nextIdx, setNextIdx] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [shotsToCeiling, setShotsToCeiling] = useState(SHOTS_PER_CEILING)
  const gameRef = useRef({
    grid: makeEmptyGrid() as Grid,
    queue: [0, 0] as [number, number],
    projectile: null as Projectile | null,
    w: CANVAS_W,
    h: CANVAS_H,
    shotCount: 0,
    gameOver: false,
  })

  const pullQueue = useCallback((g: typeof gameRef.current) => {
    const a = (Math.random() * COLOR_COUNT) | 0
    g.queue = [g.queue[1]!, a]
  }, [])

  useEffect(() => {
    const g = gameRef.current
    g.shotCount = 0
    g.gameOver = false
    fillTopRows(g.grid)
    g.queue = [(Math.random() * COLOR_COUNT) | 0, (Math.random() * COLOR_COUNT) | 0]
    setNextIdx(g.queue[0]!)
    setShotsToCeiling(SHOTS_PER_CEILING)

    const canvas = ref.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return
    }
    const bgColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--brand-background")
        .trim() || "#eeeeee"
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1)
    canvas.width = CANVAS_W * dpr
    canvas.height = CANVAS_H * dpr
    canvas.style.width = `${CANVAS_W}px`
    canvas.style.height = `${CANVAS_H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let raf = 0
    const shoot = (angle: number) => {
      if (g.projectile || g.gameOver) {
        return
      }
      g.shotCount += 1
      if (g.shotCount % SHOTS_PER_CEILING === 0) {
        if (shiftGridDown(g.grid) === "gameover") {
          g.gameOver = true
          setGameOver(true)
          return
        }
      }
      const rem = g.shotCount % SHOTS_PER_CEILING
      setShotsToCeiling(rem === 0 ? SHOTS_PER_CEILING : SHOTS_PER_CEILING - rem)
      const color = g.queue[0]!
      g.projectile = {
        x: g.w / 2,
        y: CANNON_Y,
        vx: Math.sin(angle) * SHOT_SPEED,
        vy: -Math.cos(angle) * SHOT_SPEED,
        color,
      }
      pullQueue(g)
      setNextIdx(g.queue[0]!)
    }

    const afterPlace = (pr: number, pc: number) => {
      const gr = g.grid
      const cluster = sameColorCluster(gr, pr, pc, g.w, g.h)
      if (cluster.length < 3) {
        return
      }
      for (const cell of cluster) {
        gr[cell.r]![cell.c] = null
      }
      const safe = connectedToCeiling(gr, g.w, g.h)
      let orphanScore = 0
      for (let r = 0; r < MAX_ROWS; r++) {
        for (let c = 0; c < colCount(r); c++) {
          if (gr[r]![c] === null) {
            continue
          }
          const id = `${r},${c}`
          if (!safe.has(id)) {
            orphanScore += 1
            gr[r]![c] = null
          }
        }
      }
      setScore(
        (s) => s + cluster.length * 10 + orphanScore * 15
      )
    }

    const stepProjectile = () => {
      if (g.gameOver) {
        return
      }
      const p = g.projectile
      if (!p) {
        return
      }
      for (let m = 0; m < MICROS_PER_FRAME; m++) {
        const ox = p.x
        const oy = p.y
        p.x += p.vx / MICROS_PER_FRAME
        p.y += p.vy / MICROS_PER_FRAME
        if (p.x < BUBBLE_R) {
          p.x = BUBBLE_R
          p.vx *= -1
        }
        if (p.x > g.w - BUBBLE_R) {
          p.x = g.w - BUBBLE_R
          p.vx *= -1
        }

        const segHit = firstBubbleOnSegment(ox, oy, p.x, p.y, g.grid, g.w, g.h)
        if (segHit) {
          p.x = segHit.x
          p.y = segHit.y
          const snap = pickSnapCell(
            segHit.r,
            segHit.c,
            p.x,
            p.y,
            g.grid,
            g.w,
            g.h
          )
          if (snap) {
            g.grid[snap.r]![snap.c] = p.color
            g.projectile = null
            afterPlace(snap.r, snap.c)
          } else {
            g.projectile = null
          }
          return
        }

        const inside = closestBubbleCenterOverlap(p.x, p.y, g.grid, g.w, g.h)
        if (inside) {
          const snap = pickSnapCell(
            inside.r,
            inside.c,
            p.x,
            p.y,
            g.grid,
            g.w,
            g.h
          )
          if (snap) {
            g.grid[snap.r]![snap.c] = p.color
            g.projectile = null
            afterPlace(snap.r, snap.c)
          } else {
            g.projectile = null
          }
          return
        }

        const skyY = topClusterSurfaceY(g.grid, g.w, g.h)
        if (boardHasAnyBubble(g.grid) && skyY !== null) {
          if (p.y < skyY) {
            if (hasEmptyInRow0(g.grid)) {
              const sn = firstEmptyTopRow(p.x, p.y, g.grid, g.w, g.h)
              if (sn) {
                g.grid[sn.r]![sn.c] = p.color
                g.projectile = null
                afterPlace(sn.r, sn.c)
                return
              }
            } else {
              p.y = skyY
              p.vy = Math.abs(p.vy)
            }
          }
        } else {
          if (p.y < GRID_TOP - BUBBLE_R) {
            const sn = firstEmptyTopRow(p.x, p.y, g.grid, g.w, g.h)
            if (sn) {
              g.grid[sn.r]![sn.c] = p.color
              g.projectile = null
              afterPlace(sn.r, sn.c)
              return
            }
            p.y = GRID_TOP - BUBBLE_R
            p.vy = Math.abs(p.vy)
          }
        }

        if (p.y - BUBBLE_R > g.h) {
          g.projectile = null
          return
        }
      }
    }

    const drawGrid = (ctx2: CanvasRenderingContext2D) => {
      for (let r = 0; r < MAX_ROWS; r++) {
        for (let c = 0; c < colCount(r); c++) {
          const col = g.grid[r]![c]
          if (col === null) {
            continue
          }
          const { x, y } = centerXY(r, c, g.w, g.h)
          drawBubble(ctx2, x, y, BUBBLE_COLORS[col]!)
        }
      }
    }

    const drawAim = (ctx2: CanvasRenderingContext2D) => {
      if (g.projectile) {
        return
      }
      const { angle } = aimRef.current
      const pts = buildAimPoints(g.grid, g.w, g.h, angle)
      if (pts.length < 2) {
        return
      }
      ctx2.setLineDash([4, 4])
      ctx2.strokeStyle = "rgba(26, 26, 46, 0.4)"
      ctx2.lineWidth = 1.5
      ctx2.beginPath()
      ctx2.moveTo(pts[0]!.x, pts[0]!.y)
      for (let i = 1; i < pts.length; i++) {
        ctx2.lineTo(pts[i]!.x, pts[i]!.y)
      }
      ctx2.stroke()
      ctx2.setLineDash([])
    }

    const loop = () => {
      stepProjectile()
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, g.w, g.h)
      drawGrid(ctx)
      if (g.projectile) {
        const p = g.projectile
        drawBubble(ctx, p.x, p.y, BUBBLE_COLORS[p.color]!)
      } else if (!g.gameOver) {
        const q = g.queue[0]!
        drawBubble(ctx, g.w / 2, CANNON_Y, BUBBLE_COLORS[q]!, true)
        drawAim(ctx)
      }
      if (g.gameOver) {
        ctx.fillStyle = "rgba(26, 26, 46, 0.7)"
        ctx.fillRect(0, 0, g.w, g.h)
        ctx.fillStyle = "rgba(248, 250, 252, 0.98)"
        ctx.font = "700 20px system-ui, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText("Game over", g.w / 2, g.h * 0.45)
        ctx.font = "400 12px system-ui, sans-serif"
        ctx.fillStyle = "rgba(248, 250, 252, 0.85)"
        ctx.fillText("Bubbles reached the bottom row.", g.w / 2, g.h * 0.45 + 24)
        ctx.textAlign = "left"
        ctx.textBaseline = "alphabetic"
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      aimRef.current.mouse = { x: mx, y: my }
      const dx = mx - g.w / 2
      const dy = my - CANNON_Y
      let ang = Math.atan2(dx, -dy)
      const lim = (78 * Math.PI) / 180
      if (ang < -lim) {
        ang = -lim
      }
      if (ang > lim) {
        ang = lim
      }
      aimRef.current.angle = ang
    }
    const onClick = (e: MouseEvent) => {
      onMove(e)
      shoot(aimRef.current.angle)
    }

    const fromTouch = (e: TouchEvent) => {
      e.preventDefault()
      const t = e.touches[0] || e.changedTouches[0]
      if (!t) {
        return
      }
      onMove({ clientX: t.clientX, clientY: t.clientY } as MouseEvent)
    }

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault()
      const t = e.changedTouches[0]
      if (!t) {
        return
      }
      onMove({ clientX: t.clientX, clientY: t.clientY } as MouseEvent)
      shoot(aimRef.current.angle)
    }

    const onCtxMenu = (e: Event) => e.preventDefault()
    canvas.addEventListener("mousemove", onMove)
    canvas.addEventListener("click", onClick)
    canvas.addEventListener("touchstart", fromTouch, { passive: false })
    canvas.addEventListener("touchmove", fromTouch, { passive: false })
    canvas.addEventListener("touchend", onTouchEnd, { passive: false })
    canvas.addEventListener("contextmenu", onCtxMenu)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener("mousemove", onMove)
      canvas.removeEventListener("click", onClick)
      canvas.removeEventListener("touchstart", fromTouch)
      canvas.removeEventListener("touchmove", fromTouch)
      canvas.removeEventListener("touchend", onTouchEnd)
      canvas.removeEventListener("contextmenu", onCtxMenu)
    }
  }, [pullQueue])

  const newGame = useCallback(() => {
    const g = gameRef.current
    g.grid = makeEmptyGrid()
    fillTopRows(g.grid)
    g.projectile = null
    g.shotCount = 0
    g.gameOver = false
    g.queue = [(Math.random() * COLOR_COUNT) | 0, (Math.random() * COLOR_COUNT) | 0]
    setNextIdx(g.queue[0]!)
    setScore(0)
    setGameOver(false)
    setShotsToCeiling(SHOTS_PER_CEILING)
  }, [])

  return (
    <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 small:p-5 max-w-2xl w-full">
      <p className="text-xs text-ui-fg-muted mb-3 max-w-2xl">
        Bubble shooter: aim with the mouse, click to fire. Shots use small physics
        steps for reliable wall and bubble contact. Every {SHOTS_PER_CEILING} shots
        the ceiling drops a new row &mdash; if any bubble sits on the bottom row
        when it tries to push, it&rsquo;s game over. Match-3+ clears and orphan
        drops work as before. Dashed line matches the tuned trajectory.
      </p>
      <div className="flex flex-col small:flex-row gap-4 small:items-start">
        <div className="shrink-0">
          <canvas
            ref={ref}
            className="rounded-md border border-ui-border-base bg-ui-bg-base max-w-full touch-none cursor-crosshair"
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ maxWidth: "100%", height: "auto" }}
            role="img"
            aria-label="Bubble shooter. Move the mouse to aim, click to shoot."
          />
        </div>
        <div className="text-sm text-ui-fg-base space-y-3 min-w-[8rem]">
          <div>
            <p className="text-xs font-medium text-ui-fg-muted uppercase tracking-wide">
              Score
            </p>
            <p className="text-xl font-semibold tabular-nums">{score}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ui-fg-muted uppercase tracking-wide">
              Next
            </p>
            <div
              className="w-8 h-8 mt-1 rounded-full border border-ui-border-base shadow-sm"
              style={{ background: BUBBLE_COLORS[nextIdx] }}
              aria-hidden
            />
          </div>
          <div>
            <p className="text-xs font-medium text-ui-fg-muted uppercase tracking-wide">
              Ceiling in
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {gameOver ? "—" : shotsToCeiling}{" "}
              <span className="text-xs font-normal text-ui-fg-muted">shots</span>
            </p>
          </div>
          {gameOver ? (
            <p className="text-sm text-ui-fg-base font-medium" role="status">
              New game to try again.
            </p>
          ) : null}
          <button
            type="button"
            onClick={newGame}
            className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm font-medium text-ui-fg-base hover:bg-ui-bg-subtle focus:outline-none focus:ring-2 focus:ring-ui-fg-base focus:ring-offset-1 focus:ring-offset-ui-bg-subtle"
          >
            New game
          </button>
        </div>
      </div>
    </div>
  )
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  ring?: boolean
) {
  const g = ctx.createRadialGradient(
    x - BUBBLE_R * 0.3,
    y - BUBBLE_R * 0.3,
    BUBBLE_R * 0.1,
    x,
    y,
    BUBBLE_R
  )
  g.addColorStop(0, "rgba(255,255,255,0.5)")
  g.addColorStop(0.35, fill)
  g.addColorStop(1, fill)
  ctx.beginPath()
  ctx.arc(x, y, BUBBLE_R, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = "rgba(26, 26, 46, 0.25)"
  ctx.lineWidth = 1
  ctx.stroke()
  if (ring) {
    ctx.setLineDash([3, 2])
    ctx.strokeStyle = "rgba(26, 26, 46, 0.4)"
    ctx.beginPath()
    ctx.arc(x, y, BUBBLE_R + 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }
}
