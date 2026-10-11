// Starfield + palette shared by the home space hero and the /explore catalog map.
// Pure move out of index.tsx (2026-10) so the graph page can paint the same
// backdrop without mounting the whole hero (planets, comets, ships, logo).

// ─── Palette ────────────────────────────────────────────────────────────────
export const BG = "#0B0C10"
export const STAR_DIM = "#1F2833"
export const STAR_BRIGHT = "#C5C6C7"
export const COMET_HEAD = "#FFFFFF"
export const COMET_TRAIL = "#45A29E"

// Soft background nebula blobs, coloured from the brand palette (teal accent,
// navy, a faint magenta). Drawn additively + drifting slowly behind the stars
// so the void reads as a deep, rich cosmos rather than flat black.
export const NEBULA: {
  x: number; y: number; r: number; color: [number, number, number]
  alpha: number; driftX: number; driftY: number; phase: number
}[] = [
  { x: 0.28, y: 0.34, r: 0.55, color: [40, 96, 100], alpha: 0.16, driftX: 0.00003,  driftY: 0.000021, phase: 0.0 },
  { x: 0.72, y: 0.30, r: 0.50, color: [44, 48, 96],  alpha: 0.14, driftX: 0.000025, driftY: 0.000018, phase: 2.1 },
  { x: 0.55, y: 0.70, r: 0.62, color: [82, 32, 60],  alpha: 0.10, driftX: 0.000018, driftY: 0.000015, phase: 4.0 },
]

// 3-layer parallax starfield. Each layer is a pre-rendered offscreen canvas
// that gets blitted twice per frame (with drift offset) so it tiles seamlessly.
// Layered blits + a small twinkler overlay = ~3 drawImage + ~50 fillRect per
// frame on the stars canvas, vs. 1500-3000 fillRect/frame for a redraw-from-
// scratch approach. Cheap on phone and respects DPR.
export interface StarLayer {
  canvas: HTMLCanvasElement     // device-pixel sized: w*dpr × h*dpr
  speed: number                 // logical px / ms, horizontal leftward drift
  width: number                 // logical width the layer was built for
}

export interface Twinkler {
  x: number; y: number           // logical
  size: number                   // 1 or 2 device-pixel-equivalent
  rgb: [number, number, number]
  phase: number                  // 0..2π
  freq: number                   // rad / ms
  sparkle: boolean               // hero stars get a 4-point glint near peak
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Soft luminous halo behind a planet so it reads as a lit world, not a flat
// pixel disc. Additive blend; intensity scales with the planet's depth.
export function drawPlanetGlow(ctx: CanvasRenderingContext2D, px: number, py: number, radius: number, color: string, intensity: number) {
  const [r, g, b] = hexToRgb(color)
  const glowR = radius * 2.4
  const grad = ctx.createRadialGradient(px, py, radius * 0.6, px, py, glowR)
  grad.addColorStop(0, `rgba(${r},${g},${b},${0.30 * intensity})`)
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.fillStyle = grad
  ctx.fillRect(px - glowR, py - glowR, glowR * 2, glowR * 2)
  ctx.restore()
}

// ─── Parallax starfield ──────────────────────────────────────────────────────
// Three independently-drifting star layers + a small set of twinklers. The
// per-layer offscreen canvases are pre-rendered once (and rebuilt on resize);
// the rAF loop only blits + overdraws twinklers, which keeps per-frame cost
// low even on phone.

export function pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

export function buildStarLayer(
  w: number, h: number, dpr: number,
  count: number,
  sizes: readonly number[], sizeWeights: readonly number[],
  colours: readonly string[],
): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = Math.max(1, Math.ceil(w * dpr))
  c.height = Math.max(1, Math.ceil(h * dpr))
  const ctx = c.getContext("2d")!
  ctx.scale(dpr, dpr)
  ctx.imageSmoothingEnabled = false
  for (let i = 0; i < count; i++) {
    const size = pickWeighted(sizes, sizeWeights)
    ctx.fillStyle = colours[Math.floor(Math.random() * colours.length)]
    ctx.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), size, size)
  }
  return c
}

export function buildStarfield(w: number, h: number, dpr: number): { layers: StarLayer[]; twinklers: Twinkler[] } {
  // Total star count scales with viewport area (same density baseline as the
  // pre-parallax version). Distributed 60% distant / 30% mid / 10% foreground
  // so depth reads correctly without overcrowding the foreground.
  const total = Math.floor((w * h) / 2800)
  const distantCount = Math.floor(total * 0.6)
  const midCount = Math.floor(total * 0.3)
  const fgCount = Math.max(8, Math.floor(total * 0.1))

  const distant = buildStarLayer(w, h, dpr, distantCount,
    [1], [1],
    ["#1F2833", "#252F40", "#2A3548"])
  const mid = buildStarLayer(w, h, dpr, midCount,
    [1, 2], [0.85, 0.15],
    ["#5C6370", "#7A8390", "#9098A6"])
  const fg = buildStarLayer(w, h, dpr, fgCount,
    [1, 2], [0.45, 0.55],
    ["#C5C6C7", "#FFFFFF", "#66FCF1", "#FFE680"])

  const layers: StarLayer[] = [
    { canvas: distant, speed: 0.005, width: w },
    { canvas: mid,     speed: 0.018, width: w },
    { canvas: fg,      speed: 0.045, width: w },
  ]

  // Twinklers float over the foreground layer and modulate alpha via sin().
  // Cap count for phone; we want this to feel alive, not chaotic.
  const twinklerCount = Math.min(40, Math.max(10, Math.floor((w * h) / 32000)))
  const twinklers: Twinkler[] = []
  const twinklerPalette: [number, number, number][] = [
    [197, 198, 199], // STAR_BRIGHT
    [255, 255, 255], // pure white
    [102, 252, 241], // cyan (matches secondary palette)
    [255, 230, 128], // soft gold
  ]
  for (let i = 0; i < twinklerCount; i++) {
    twinklers.push({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() < 0.35 ? 2 : 1,
      rgb: twinklerPalette[Math.floor(Math.random() * twinklerPalette.length)],
      phase: Math.random() * Math.PI * 2,
      freq: 0.001 + Math.random() * 0.003,
      sparkle: Math.random() < 0.22,
    })
  }

  return { layers, twinklers }
}

export function setupStarsCanvasSize(canvas: HTMLCanvasElement, w: number, h: number, dpr: number) {
  canvas.width = Math.max(1, Math.ceil(w * dpr))
  canvas.height = Math.max(1, Math.ceil(h * dpr))
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
}

export function paintStarsFrame(
  canvas: HTMLCanvasElement,
  w: number, h: number, dpr: number,
  layers: readonly StarLayer[],
  twinklers: readonly Twinkler[],
  elapsed: number,
  parallaxX = 0,
) {
  const ctx = canvas.getContext("2d")!
  // Reset transform every frame in case the canvas was resized between paints
  // (canvas.width = ... clears state). Single setTransform replaces save/scale/restore.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, w, h)

  // Soft drifting nebula clouds (behind the stars). Additive blend over the
  // near-black void adds colour + depth without any new moving "objects".
  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  for (const n of NEBULA) {
    const nx = n.x * w + Math.sin(elapsed * n.driftX + n.phase) * w * 0.05 - parallaxX * 6
    const ny = n.y * h + Math.cos(elapsed * n.driftY + n.phase) * h * 0.045
    const rad = n.r * Math.max(w, h)
    const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, rad)
    g.addColorStop(0, `rgba(${n.color[0]},${n.color[1]},${n.color[2]},${n.alpha})`)
    g.addColorStop(0.5, `rgba(${n.color[0]},${n.color[1]},${n.color[2]},${n.alpha * 0.4})`)
    g.addColorStop(1, `rgba(${n.color[0]},${n.color[1]},${n.color[2]},0)`)
    ctx.fillStyle = g
    ctx.fillRect(nx - rad, ny - rad, rad * 2, rad * 2)
  }
  ctx.restore()

  // Per-layer horizontal parallax, folded into the seamless tiling offset.
  // Distant layer barely shifts; foreground shifts most → depth on mouse move.
  const PLX = [0.25, 0.55, 1.0]
  layers.forEach((layer, i) => {
    let offset = (elapsed * layer.speed - parallaxX * 16 * (PLX[i] ?? 1)) % layer.width
    if (offset < 0) offset += layer.width
    // Blit the layer twice (current frame + wrapped) so the horizontal drift
    // tiles seamlessly with no visible seam.
    ctx.drawImage(layer.canvas, -offset, 0, layer.width, h)
    ctx.drawImage(layer.canvas, layer.width - offset, 0, layer.width, h)
  })

  for (const t of twinklers) {
    // sin-modulated 0..1; only render the "on" half so each star spends roughly
    // half its cycle dark. Gives the classic 8-bit blinker rhythm without a
    // background-locked twinkle that you'd see on every star at once.
    const lum = (Math.sin(elapsed * t.freq + t.phase) + 1) * 0.5
    if (lum < 0.5) continue
    const alpha = (lum - 0.5) * 2
    ctx.fillStyle = `rgba(${t.rgb[0]},${t.rgb[1]},${t.rgb[2]},${alpha})`
    ctx.fillRect(Math.floor(t.x), Math.floor(t.y), t.size, t.size)
    // Hero stars get a brief 4-point diamond glint near peak brightness.
    if (t.sparkle && alpha > 0.6) {
      const ga = ((alpha - 0.6) / 0.4) * 0.5
      const gx = Math.floor(t.x), gy = Math.floor(t.y)
      ctx.fillStyle = `rgba(${t.rgb[0]},${t.rgb[1]},${t.rgb[2]},${ga})`
      ctx.fillRect(gx - 2, gy, 5, 1)
      ctx.fillRect(gx, gy - 2, 1, 5)
    }
  }
}
