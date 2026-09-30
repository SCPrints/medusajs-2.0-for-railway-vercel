/**
 * Fluid-grid particle physics for the wordmark.
 *
 * The cursor does exactly one thing: deposit its velocity into a coarse grid.
 * One pressure pass curls that into vortices, the grid decays slowly, and
 * particles ride it as tracers. The home spring is switched OFF while a
 * particle is moving — that gate plus the slow decay is what makes letters
 * drag like material and take seconds to recover.
 *
 * Same algorithm and constants as the reference (newmixcoffee.com hero).
 * Units are CSS px per step, one step = 1/60s — the constants are per-step,
 * so callers must run a fixed timestep. Don't retune these by eye; capture
 * against the reference first.
 */
export const STEP_S = 1 / 60

const CELL = 10
const DEPOSIT_RADIUS = 48
const DEPOSIT_SUBDIV = 6
const CELL_SPEED_CAP = 100
const CELL_DECAY = 0.99
const PRESSURE_GAIN = 0.25
const RIDE = 0.06
const PARTICLE_SPEED_CAP = 30
const PARTICLE_DAMPING = 0.4
/** Above this speed (px/step) a particle has no home spring at all. */
const SPRING_GATE_SPEED = 0.5
const SPRING_RAMP_S = 0.05
const SPRING_RATE = 50

export type Sim = {
  w: number
  h: number
  cols: number
  rows: number
  /** Grid arrays carry a 1-cell zero border (stride = cols + 2) so the
   * neighbour stencils need no bounds checks. */
  xv: Float32Array
  yv: Float32Array
  pressure: Float32Array
  count: number
  /** xyz triples, shared with the render geometry. y is down. */
  pos: Float32Array
  /** xy pairs. */
  home: Float32Array
  pxv: Float32Array
  pyv: Float32Array
  /** Sim time the spring re-engaged; NaN = spring off. */
  returnAt: Float64Array
}

export function createSim(
  w: number,
  h: number,
  home: Float32Array,
  pos: Float32Array
): Sim {
  const cols = Math.ceil(w / CELL)
  const rows = Math.ceil(h / CELL)
  const count = home.length / 2
  return {
    w,
    h,
    cols,
    rows,
    xv: new Float32Array((cols + 2) * (rows + 2)),
    yv: new Float32Array((cols + 2) * (rows + 2)),
    pressure: new Float32Array((cols + 2) * (rows + 2)),
    count,
    pos,
    home,
    pxv: new Float32Array(count),
    pyv: new Float32Array(count),
    returnAt: new Float64Array(count).fill(NaN),
  }
}

/** Stamp a cursor stroke into the grid. Every sub-step adds the FULL stroke
 * delta, so a fast flick injects more energy than a slow drag. */
export function deposit(
  sim: Sim,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): void {
  const { cols, rows, xv, yv } = sim
  const dx = x1 - x0
  const dy = y1 - y0
  const stride = cols + 2
  const steps = Math.max(
    1,
    Math.ceil(Math.sqrt(dx * dx + dy * dy) / DEPOSIT_SUBDIV)
  )
  for (let s = 0; s <= steps; s++) {
    const u = s / steps
    const cx = x0 + dx * u
    const cy = y0 + dy * u
    const c0 = Math.max(0, ((cx - DEPOSIT_RADIUS) / CELL) | 0)
    const c1 = Math.min(cols - 1, ((cx + DEPOSIT_RADIUS) / CELL) | 0)
    const r0 = Math.max(0, ((cy - DEPOSIT_RADIUS) / CELL) | 0)
    const r1 = Math.min(rows - 1, ((cy + DEPOSIT_RADIUS) / CELL) | 0)
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ex = c * CELL - cx
        const ey = r * CELL - cy
        let dist = Math.sqrt(ex * ex + ey * ey)
        if (dist >= DEPOSIT_RADIUS) continue
        // Dead centre gets the weakest push, not the strongest — leaves the
        // soft void under the cursor.
        if (dist < 4) dist = DEPOSIT_RADIUS
        const wgt = DEPOSIT_RADIUS / dist
        const i = (r + 1) * stride + c + 1
        xv[i]! += dx * wgt
        yv[i]! += dy * wgt
      }
    }
  }
}

/** Advance grid + particles by one fixed step. `t` is sim time in seconds. */
export function step(sim: Sim, t: number): void {
  const { w, h, cols, rows, xv, yv, pressure, count, pos, home, pxv, pyv } = sim
  const returnAt = sim.returnAt

  const stride = cols + 2

  // Ambient drift so the resting wordmark breathes.
  const phase = 0.06 * t
  for (let r = 0; r < rows; r++) {
    const ax = 0.005 * Math.sin(0.005 * r * CELL + phase)
    const row = (r + 1) * stride + 1
    for (let c = 0; c < cols; c++) {
      xv[row + c]! += ax
      yv[row + c]! += 0.005 * Math.cos(0.005 * c * CELL - 1.1 * phase)
    }
  }

  // One pressure pass: divergence → pressure → push velocity along its
  // gradient. This is what curls a straight stroke into a vortex pair.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r + 1) * stride + c + 1
      const u = i - stride
      const d = i + stride
      pressure[i] =
        (0.5 * xv[u - 1]! +
          xv[i - 1]! +
          0.5 * xv[d - 1]! -
          0.5 * xv[u + 1]! -
          xv[i + 1]! -
          0.5 * xv[d + 1]! +
          0.5 * yv[u - 1]! +
          yv[u]! +
          0.5 * yv[u + 1]! -
          0.5 * yv[d - 1]! -
          yv[d]! -
          0.5 * yv[d + 1]!) *
        PRESSURE_GAIN
    }
  }
  const capSq = CELL_SPEED_CAP * CELL_SPEED_CAP
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r + 1) * stride + c + 1
      const u = i - stride
      const d = i + stride
      const pul = 0.5 * pressure[u - 1]!
      const pur = 0.5 * pressure[u + 1]!
      const pdl = 0.5 * pressure[d - 1]!
      const pdr = 0.5 * pressure[d + 1]!
      let vx =
        xv[i]! +
        (pul + pressure[i - 1]! + pdl - pur - pressure[i + 1]! - pdr) *
          PRESSURE_GAIN
      let vy =
        yv[i]! +
        (pul + pressure[u]! + pur - pdl - pressure[d]! - pdr) * PRESSURE_GAIN
      const spSq = vx * vx + vy * vy
      if (spSq > capSq) {
        const k = CELL_SPEED_CAP / Math.sqrt(spSq)
        vx *= k
        vy *= k
      }
      xv[i] = vx * CELL_DECAY
      yv[i] = vy * CELL_DECAY
    }
  }

  const gateSq = SPRING_GATE_SPEED * SPRING_GATE_SPEED
  const pCapSq = PARTICLE_SPEED_CAP * PARTICLE_SPEED_CAP
  for (let p = 0; p < count; p++) {
    const p3 = p * 3
    let x = pos[p3]!
    let y = pos[p3 + 1]!
    let vx = pxv[p]!
    let vy = pyv[p]!

    // Speed-gated home spring.
    if (vx * vx + vy * vy > gateSq) returnAt[p] = NaN
    else if (returnAt[p] !== returnAt[p]) returnAt[p] = t
    const since = returnAt[p]!
    if (since === since) {
      const n = Math.min(1, (t - since) / SPRING_RAMP_S)
      const k = SPRING_RATE * STEP_S * (0.15 + 0.85 * n * n * (3 - 2 * n))
      vx += (home[p * 2]! - x) * k
      vy += (home[p * 2 + 1]! - y) * k
    }

    // Ride the grid. The 3-tap weights (own, right, down) are deliberately
    // not a true bilinear sample — they're part of the reference's feel.
    const gx = (x < 0 ? 0 : x > w ? w : x) / CELL
    const gy = (y < 0 ? 0 : y > h ? h : y) / CELL
    const c = gx >= cols ? cols - 1 : gx | 0
    const r = gy >= rows ? rows - 1 : gy | 0
    const own = (r + 1) * stride + c + 1
    const right = c + 1 < cols ? own + 1 : own
    const down = r + 1 < rows ? own + stride : own
    // Position within the cell, 0..1 (wraps for off-grid particles).
    const fx = x / CELL - Math.floor(x / CELL)
    const fy = y / CELL - Math.floor(y / CELL)
    vx += ((1 - fx) * xv[own]! + fx * xv[right]! + fy * xv[down]!) * RIDE
    vy += ((1 - fy) * yv[own]! + fx * yv[right]! + fy * yv[down]!) * RIDE

    const spSq = vx * vx + vy * vy
    if (spSq > pCapSq) {
      const k = PARTICLE_SPEED_CAP / Math.sqrt(spSq)
      vx *= k
      vy *= k
    }
    x += vx
    y += vy
    pos[p3] = x
    pos[p3 + 1] = y
    pxv[p] = vx * PARTICLE_DAMPING
    pyv[p] = vy * PARTICLE_DAMPING
  }
}
