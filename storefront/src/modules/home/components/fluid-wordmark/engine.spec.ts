import { createSim, deposit, step, STEP_S } from "./engine"

/** A 40x40 block of particles in the middle of a 600x400 field. */
function makeSim() {
  const pts: number[] = []
  for (let y = 180; y < 220; y += 2) for (let x = 280; x < 320; x += 2) pts.push(x, y)
  const home = new Float32Array(pts)
  const pos = new Float32Array((pts.length / 2) * 3)
  for (let i = 0; i < pts.length / 2; i++) {
    pos[i * 3] = pts[i * 2]!
    pos[i * 3 + 1] = pts[i * 2 + 1]!
  }
  return createSim(600, 400, home, pos)
}

function meanOffset(sim: ReturnType<typeof makeSim>) {
  let sum = 0
  for (let i = 0; i < sim.count; i++) {
    sum += Math.hypot(
      sim.pos[i * 3]! - sim.home[i * 2]!,
      sim.pos[i * 3 + 1]! - sim.home[i * 2 + 1]!
    )
  }
  return sum / sim.count
}

function run(sim: ReturnType<typeof makeSim>, from: number, seconds: number) {
  const n = Math.round(seconds / STEP_S)
  for (let i = 0; i < n; i++) step(sim, from + i * STEP_S)
  return from + n * STEP_S
}

describe("fluid wordmark engine", () => {
  it("holds the wordmark at rest", () => {
    const sim = makeSim()
    run(sim, 0, 2)
    expect(meanOffset(sim)).toBeLessThan(0.5)
  })

  it("drags material along a stroke, keeps it displaced, then recovers", () => {
    const sim = makeSim()
    let t = 0
    // Left-to-right swipe through the block, 20px per step.
    for (let x = 200; x < 400; x += 20) {
      deposit(sim, x, 200, x + 20, 200)
      step(sim, t)
      t += STEP_S
    }
    t = run(sim, t, 0.5)
    const dragged = meanOffset(sim)
    expect(dragged).toBeGreaterThan(20)

    // Net displacement follows the stroke direction.
    let dx = 0
    for (let i = 0; i < sim.count; i++) dx += sim.pos[i * 3]! - sim.home[i * 2]!
    expect(dx / sim.count).toBeGreaterThan(10)

    // Still clearly displaced a second later — slow recovery, not a snap.
    t = run(sim, t, 1)
    expect(meanOffset(sim)).toBeGreaterThan(5)

    run(sim, t, 15)
    expect(meanOffset(sim)).toBeLessThan(1)
  })

  it("ignores strokes that land entirely off-grid", () => {
    const sim = makeSim()
    deposit(sim, -500, -500, -400, -500)
    expect(sim.xv.every((v) => v === 0)).toBe(true)
  })
})
