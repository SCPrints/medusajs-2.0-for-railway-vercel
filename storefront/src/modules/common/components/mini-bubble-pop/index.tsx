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
const STEP = 2 * BUBBLE_R
const ROW_H = BUBBLE_R * Math.sqrt(3)
const CANVAS_W = 360
const CANVAS_H = 520
const CANNON_Y = CANVAS_H - 36
const GRID_TOP = 48
const MAX_ROWS = 14
const FILLED_START_ROWS = 6
const TRAJ_STEPS = 120
const SUB_STEPS = 8
const SHOT_SPEED = 9.5

function colCount(r: number): number {
  return r % 2 === 0 ? 8 : 7
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < MAX_ROWS && c >= 0 && c < colCount(r)
}

type Cell = number | null
type Grid = Cell[][]

function makeEmptyGrid(): Grid {
  return Array.from({ length: MAX_ROWS }, (_, r) =>
    Array.from({ length: colCount(r) }, () => null)
  )
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

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
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

type Projectile = { x: number; y: number; vx: number; vy: number; color: number }

export default function MiniBubblePop() {
  const ref = useRef<HTMLCanvasElement>(null)
  const aimRef = useRef({ angle: -Math.PI / 2, mouse: { x: 0, y: 0 } })
  const [score, setScore] = useState(0)
  const [nextIdx, setNextIdx] = useState(0)
  const gameRef = useRef({
    grid: makeEmptyGrid() as Grid,
    queue: [0, 0] as [number, number],
    projectile: null as Projectile | null,
    w: CANVAS_W,
    h: CANVAS_H,
  })

  const pullQueue = useCallback((g: typeof gameRef.current) => {
    const a = (Math.random() * COLOR_COUNT) | 0
    g.queue = [g.queue[1]!, a]
  }, [])

  useEffect(() => {
    const g = gameRef.current
    fillTopRows(g.grid)
    g.queue = [(Math.random() * COLOR_COUNT) | 0, (Math.random() * COLOR_COUNT) | 0]
    setNextIdx(g.queue[0]!)

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
      if (g.projectile) {
        return
      }
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

    const HIT_R2 = (2 * BUBBLE_R * 0.9) * (2 * BUBBLE_R * 0.9)

    const stepProjectile = () => {
      const p = g.projectile
      if (!p) {
        return
      }
      for (let s = 0; s < SUB_STEPS; s++) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < BUBBLE_R) {
          p.x = BUBBLE_R
          p.vx *= -1
        }
        if (p.x > g.w - BUBBLE_R) {
          p.x = g.w - BUBBLE_R
          p.vx *= -1
        }

        let bestHit: { r: number; c: number; d2: number } | null = null
        for (let r = 0; r < MAX_ROWS; r++) {
          for (let c = 0; c < colCount(r); c++) {
            if (g.grid[r]![c] === null) {
              continue
            }
            const { x: cx, y: cy } = centerXY(r, c, g.w, g.h)
            const d2c = dist2(p.x, p.y, cx, cy)
            if (d2c < HIT_R2 && (bestHit === null || d2c < bestHit.d2)) {
              bestHit = { r, c, d2: d2c }
            }
          }
        }

        if (bestHit) {
          const snap = pickSnapCell(
            bestHit.r,
            bestHit.c,
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
            return
          }
          g.projectile = null
          return
        }

        if (p.y < GRID_TOP - BUBBLE_R) {
          const sn = firstEmptyTopRow(p.x, p.y, g.grid, g.w, g.h)
          if (sn) {
            g.grid[sn.r]![sn.c] = p.color
            g.projectile = null
            afterPlace(sn.r, sn.c)
            return
          }
          if (boardHasAnyBubble(g.grid)) {
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
      let x = g.w / 2
      let y = CANNON_Y
      let vx = Math.sin(angle) * SHOT_SPEED
      let vy = -Math.cos(angle) * SHOT_SPEED
      ctx2.setLineDash([4, 4])
      ctx2.strokeStyle = "rgba(26, 26, 46, 0.4)"
      ctx2.lineWidth = 1.5
      ctx2.beginPath()
      ctx2.moveTo(x, y)
      for (let i = 0; i < TRAJ_STEPS; i++) {
        for (let s = 0; s < 4; s++) {
          x += vx
          y += vy
          if (x < BUBBLE_R) {
            x = BUBBLE_R
            vx *= -1
          }
          if (x > g.w - BUBBLE_R) {
            x = g.w - BUBBLE_R
            vx *= -1
          }
        }
        if (i % 2 === 0) {
          ctx2.lineTo(x, y)
        }
        if (y < 20) {
          break
        }
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
      } else {
        const q = g.queue[0]!
        drawBubble(ctx, g.w / 2, CANNON_Y, BUBBLE_COLORS[q]!, true)
        drawAim(ctx)
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
    g.queue = [(Math.random() * COLOR_COUNT) | 0, (Math.random() * COLOR_COUNT) | 0]
    setNextIdx(g.queue[0]!)
    setScore(0)
  }, [])

  return (
    <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 small:p-5 max-w-2xl w-full">
      <p className="text-xs text-ui-fg-muted mb-3 max-w-2xl">
        Bubble shooter: aim with the mouse, click to fire. The shot bounces off the
        side walls, sticks to the hex-style grid, clears groups of 3+ of the same
        colour, then drops any bubbles no longer connected to the ceiling. Dashed
        line is the aim preview. Brand palette matches the storefront.
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
