"use client"

import React, { useCallback, useEffect, useRef } from "react"

/**
 * ScreenprintCmykHero — a Canvas 2D animation of a CMYK screen-print job
 * registering the SC PRINTS wordmark, the iconic print-shop visual.
 *
 * WHAT IT SHOWS
 * The SC PRINTS logo is reproduced exactly the way a four-colour screen-print is
 * produced on press: four screens — Cyan, Magenta, Yellow, then Black (K) — are
 * laid down one at a time. Because the source asset is *black* art on transparent
 * (alpha = ink coverage), we don't separate raw black. Instead we build a genuinely
 * COLOURFUL source artwork = the logo alpha used as a mask over a diagonal brand
 * gradient (teal #3dcfc2 → magenta #ff2e63 → navy #1a1a2e). We sample THAT coloured
 * artwork per halftone cell and convert each RGB → CMYK, so there is real C/M/Y/K
 * content to register into the full-colour mark.
 *
 * Per channel (in C → M → Y → K order):
 *   • A squeegee bar sweeps left→right across the art.
 *   • BEHIND the squeegee, that channel's AM halftone dots appear — a grid of dots
 *     whose radius ∝ that channel's coverage at the cell, rotated to the classic
 *     screen angles (C 15°, M 75°, Y 0°, K 45°). The overlapping rotated screens
 *     produce the authentic CMYK rosette.
 *   • The channel ENTERS slightly mis-registered (a few px offset + a hair of
 *     rotation) and EASES into perfect registration — the "registration" beat.
 *   • C/M/Y dots composite with globalCompositeOperation = "multiply" on white
 *     paper so colour builds subtractively (cyan+magenta = blue, etc.); K prints
 *     near-black on top.
 *
 * After K registers, the crisp full-colour rosette HOLDS ~2s, then the halftone
 * cross-fades to a clean solid fill of the coloured mark (the reward beat), holds
 * briefly, then the whole sequence resets and loops (~12s round trip).
 *
 * INTERACTIVITY
 * A magnifier LOUPE follows the cursor: inside its circle the halftone is redrawn
 * at higher zoom so the individual CMYK dots / rosette are visible. Subtle ring +
 * slight magnification; defaults to off until the first pointer move.
 *
 * HOW IT LOOPS / PERF
 * Per-channel dot arrays (cell centre + this-channel radius) are PRECOMPUTED once
 * per size (and on resize) — only the reveal progress, registration offset and the
 * loupe animate each frame. Single Canvas 2D layer, DPR-capped at 2. Pauses
 * offscreen (IntersectionObserver), defers the rAF loop to idle, and for
 * prefers-reduced-motion paints ONE static frame of the fully-registered rosette
 * and never starts the loop. Mirrors the digital-rain-hero accessibility +
 * performance patterns.
 */

// ─── Tuning ───────────────────────────────────────────────────────────────────
const TUNING = {
  // Halftone cell pitch (logical px). Smaller = finer screen / more dots.
  cellDesktop: 11,
  cellTablet: 12,
  cellPhone: 13,
  // Hard ceiling on dots PER CHANNEL (perf guard; sampling stops once hit).
  maxDotsPerChannel: 4200,
  // Alpha threshold on the logo mask for a cell to count as "inked".
  alphaThreshold: 40,
  // Logo box as a fraction of the smaller canvas dimension ("contain" fit).
  logoFrac: 0.78,
  // Screen angles (degrees) — classic CMYK rosette angles.
  angles: { c: 15, m: 75, y: 0, k: 45 },
  // Mis-registration the channel enters with (logical px) before easing to 0.
  misRegPx: 7,
  misRegRotDeg: 1.4,
  // Loupe.
  loupeRadius: 92,
  loupeZoom: 2.4,
} as const

// Brand palette.
const PAPER = "#fbfbf8" // off-white press stock
const BRAND_TEAL = { r: 0x3d, g: 0xcf, b: 0xc2 } // #3dcfc2
const BRAND_MAGENTA = { r: 0xff, g: 0x2e, b: 0x63 } // #ff2e63
const BRAND_NAVY = { r: 0x1a, g: 0x1a, b: 0x2e } // #1a1a2e

// Process ink colours used to paint each channel's dots (subtractive on white).
const INK = {
  c: "rgba(0, 174, 239, 1)", // process cyan
  m: "rgba(236, 0, 140, 1)", // process magenta
  y: "rgba(255, 222, 0, 1)", // process yellow
  k: "rgba(26, 26, 38, 1)", // near-black (brand navy-black)
} as const

type ChannelKey = "c" | "m" | "y" | "k"
const CHANNEL_ORDER: ChannelKey[] = ["c", "m", "y", "k"]
const CHANNEL_LABEL: Record<ChannelKey, string> = { c: "C", m: "M", y: "Y", k: "K" }

// ─── Sequence timing (ms) ─────────────────────────────────────────────────────
const T = {
  perChannelSweep: 1500, // squeegee sweep + dot reveal for one channel
  perChannelRegister: 700, // registration ease-in (overlaps the tail of the sweep)
  betweenChannels: 240, // small beat between channels
  holdRosette: 2000, // hold the finished rosette
  solidFade: 900, // dots → solid cross-fade
  holdSolid: 1100, // hold the solid mark
  resetFade: 700, // fade back to blank paper before looping
} as const

// ─── Math helpers ─────────────────────────────────────────────────────────────
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
// Smootherstep — zero 1st & 2nd derivatives at the ends, very clean easing.
const smoother = (t: number) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

function cellForWidth(w: number): number {
  if (w < 640) return TUNING.cellPhone
  if (w < 1024) return TUNING.cellTablet
  return TUNING.cellDesktop
}

// RGB (0..255) → CMYK (each 0..1), guarding the divide-by-zero at pure black.
function rgbToCmyk(r: number, g: number, b: number) {
  const rf = r / 255
  const gf = g / 255
  const bf = b / 255
  const k = 1 - Math.max(rf, gf, bf)
  const inv = 1 - k
  if (inv <= 1e-4) return { c: 0, m: 0, y: 0, k }
  return {
    c: (1 - rf - k) / inv,
    m: (1 - gf - k) / inv,
    y: (1 - bf - k) / inv,
    k,
  }
}

// Diagonal brand gradient (teal → magenta → navy) sampled at normalised (u,v).
// u+v runs 0 (top-left) → 2 (bottom-right); we map that onto the 3 stops.
function brandGradientAt(u: number, v: number) {
  const t = clamp01((u + v) / 2)
  if (t < 0.5) {
    const k = t / 0.5
    return {
      r: lerp(BRAND_TEAL.r, BRAND_MAGENTA.r, k),
      g: lerp(BRAND_TEAL.g, BRAND_MAGENTA.g, k),
      b: lerp(BRAND_TEAL.b, BRAND_MAGENTA.b, k),
    }
  }
  const k = (t - 0.5) / 0.5
  return {
    r: lerp(BRAND_MAGENTA.r, BRAND_NAVY.r, k),
    g: lerp(BRAND_MAGENTA.g, BRAND_NAVY.g, k),
    b: lerp(BRAND_MAGENTA.b, BRAND_NAVY.b, k),
  }
}

// ─── Geometry model (precomputed per size) ────────────────────────────────────
interface Dot {
  x: number // logical centre x (in canvas space)
  y: number // logical centre y
  rMax: number // max dot radius for this channel/cell (∝ coverage)
  sweepU: number // 0..1 horizontal position used to time the squeegee reveal
}

interface SolidPx {
  // A coarse pixel of the finished coloured mark, for the solid-fill reward beat.
  x: number
  y: number
  size: number
  color: string
}

interface Geometry {
  cell: number
  // Logo bounding box in canvas space (used for the squeegee + gradient mapping).
  box: { x: number; y: number; w: number; h: number }
  dots: Record<ChannelKey, Dot[]>
  solid: SolidPx[]
  ready: boolean
}

const EMPTY_GEOMETRY: Geometry = {
  cell: TUNING.cellDesktop,
  box: { x: 0, y: 0, w: 0, h: 0 },
  dots: { c: [], m: [], y: [], k: [] },
  solid: [],
  ready: false,
}

// Build all per-channel halftone dots + the solid-fill pixels for the current
// size by sampling the (already loaded) logo image masked over the brand gradient.
function buildGeometry(img: HTMLImageElement, w: number, h: number): Geometry {
  const cell = cellForWidth(w)
  const fit = Math.min(w, h) * TUNING.logoFrac
  // "contain" the logo aspect ratio inside a square-ish box centred on the canvas.
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight)
  let boxW = fit
  let boxH = fit / aspect
  if (boxH > h * 0.62) {
    boxH = h * 0.62
    boxW = boxH * aspect
  }
  const boxX = (w - boxW) / 2
  const boxY = (h - boxH) / 2
  const box = { x: boxX, y: boxY, w: boxW, h: boxH }

  // Render the logo to an offscreen buffer at the box's pixel size so we can read
  // its alpha per halftone cell. Round down to keep getImageData modest.
  const bw = Math.max(1, Math.round(boxW))
  const bh = Math.max(1, Math.round(boxH))
  const off = document.createElement("canvas")
  off.width = bw
  off.height = bh
  const offCtx = off.getContext("2d", { willReadFrequently: true })
  if (!offCtx) return { ...EMPTY_GEOMETRY, cell, box, ready: false }
  offCtx.clearRect(0, 0, bw, bh)
  offCtx.drawImage(img, 0, 0, bw, bh)
  let data: Uint8ClampedArray
  try {
    data = offCtx.getImageData(0, 0, bw, bh).data
  } catch {
    // Tainted canvas (shouldn't happen same-origin) — bail to empty, loop no-ops.
    return { ...EMPTY_GEOMETRY, cell, box, ready: false }
  }

  const dots: Record<ChannelKey, Dot[]> = { c: [], m: [], y: [], k: [] }
  const solid: SolidPx[] = []
  // Max dot radius so neighbouring full-coverage dots just kiss (rosette look).
  const rMaxCell = cell * 0.62

  // Walk the box in cell steps. For each inked cell, sample alpha + the brand
  // gradient colour at that cell, convert to CMYK, and emit a dot per channel.
  for (let cy = box.y + cell / 2; cy < box.y + box.h; cy += cell) {
    for (let cx = box.x + cell / 2; cx < box.x + box.w; cx += cell) {
      // Offscreen pixel coords for this cell centre.
      const px = Math.floor(cx - box.x)
      const py = Math.floor(cy - box.y)
      if (px < 0 || py < 0 || px >= bw || py >= bh) continue
      const idx = (py * bw + px) * 4
      const alpha = data[idx + 3]
      if (alpha <= TUNING.alphaThreshold) continue

      // Normalised position within the box drives the brand gradient.
      const u = (cx - box.x) / box.w
      const v = (cy - box.y) / box.h
      const rgb = brandGradientAt(u, v)
      const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b)
      // Coverage scaled by mask alpha so feathered logo edges read as lighter ink.
      const cov = alpha / 255

      // Solid-fill reward pixel (the finished coloured mark, coarse).
      solid.push({
        x: cx,
        y: cy,
        size: cell,
        color: `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`,
      })

      const channels: Record<ChannelKey, number> = {
        c: cmyk.c,
        m: cmyk.m,
        y: cmyk.y,
        k: cmyk.k,
      }
      for (const ch of CHANNEL_ORDER) {
        const amount = channels[ch] * cov
        if (amount <= 0.02) continue
        // Radius ∝ sqrt(coverage) so dot AREA tracks coverage (perceptually right).
        const rMax = rMaxCell * Math.sqrt(clamp01(amount))
        if (rMax < 0.35) continue
        if (dots[ch].length >= TUNING.maxDotsPerChannel) continue
        dots[ch].push({ x: cx, y: cy, rMax, sweepU: u })
      }
    }
  }

  return { cell, box, dots, solid, ready: true }
}

// ─── Sequence state ───────────────────────────────────────────────────────────
// One full loop is split into phases. `elapsed` (ms, looping) drives everything.
const LOOP_MS = (() => {
  const channels =
    CHANNEL_ORDER.length * (T.perChannelSweep + T.betweenChannels)
  return (
    channels + T.holdRosette + T.solidFade + T.holdSolid + T.resetFade
  )
})()

interface FrameState {
  // Per-channel reveal 0..1 (how much of the squeegee sweep is done → dots shown).
  reveal: Record<ChannelKey, number>
  // Per-channel registration 0..1 (1 = perfectly registered, 0 = full mis-reg).
  register: Record<ChannelKey, number>
  // Which channel's squeegee is currently sweeping (null = none / hold phases).
  activeChannel: ChannelKey | null
  // Squeegee head x within the active channel (logical px), or null.
  squeegeeX: number | null
  // 0..1 solid-fill cross-fade (0 = pure dots, 1 = solid coloured mark).
  solidMix: number
  // 0..1 global fade of the whole printed image (for the reset-to-paper beat).
  printAlpha: number
}

function computeFrame(elapsed: number): FrameState {
  const reveal: Record<ChannelKey, number> = { c: 0, m: 0, y: 0, k: 0 }
  const register: Record<ChannelKey, number> = { c: 0, m: 0, y: 0, k: 0 }
  let activeChannel: ChannelKey | null = null
  let squeegeeX: number | null = null
  let solidMix = 0
  let printAlpha = 1

  const channelBlock = T.perChannelSweep + T.betweenChannels
  const channelsTotal = CHANNEL_ORDER.length * channelBlock

  for (let i = 0; i < CHANNEL_ORDER.length; i++) {
    const ch = CHANNEL_ORDER[i]
    const start = i * channelBlock
    const local = elapsed - start
    if (local >= channelBlock) {
      // This channel is fully done.
      reveal[ch] = 1
      register[ch] = 1
    } else if (local >= 0) {
      // Sweep drives the reveal; registration eases over the first part.
      const sweepT = clamp01(local / T.perChannelSweep)
      reveal[ch] = sweepT
      register[ch] = smoother(clamp01(local / T.perChannelRegister))
      if (local < T.perChannelSweep) {
        activeChannel = ch
        // sweepX is filled later (needs the box); store the raw fraction here.
        squeegeeX = sweepT
      }
    }
    // local < 0 → channel hasn't started; stays 0/0.
  }

  if (elapsed >= channelsTotal) {
    // All four down — hold, then solid cross-fade, then hold, then reset fade.
    const after = elapsed - channelsTotal
    if (after < T.holdRosette) {
      // hold rosette
    } else if (after < T.holdRosette + T.solidFade) {
      solidMix = smoother((after - T.holdRosette) / T.solidFade)
    } else if (after < T.holdRosette + T.solidFade + T.holdSolid) {
      solidMix = 1
    } else {
      // reset fade: solid mark fades out to blank paper before the loop wraps.
      const ft = (after - T.holdRosette - T.solidFade - T.holdSolid) / T.resetFade
      solidMix = 1
      printAlpha = 1 - smoother(clamp01(ft))
    }
  }

  return { reveal, register, activeChannel, squeegeeX, solidMix, printAlpha }
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

// Paint the off-white paper + faint grain + corner registration crosshairs.
function drawPaper(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, w, h)

  // Very faint paper grain — a sparse scatter of barely-there specks. Cheap and
  // deterministic-ish (we don't store it; it's subtle enough to redraw freely).
  ctx.save()
  ctx.globalAlpha = 0.025
  ctx.fillStyle = "#000"
  const step = 7
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      // Hash-ish pattern so it doesn't look like a perfect grid.
      if (((x * 13 + y * 7) % 29) < 3) {
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }
  ctx.restore()

  // Corner registration crosshairs (the classic + marks just inside each corner).
  ctx.save()
  ctx.strokeStyle = "rgba(26,26,46,0.55)"
  ctx.lineWidth = 1
  const m = Math.max(26, Math.min(w, h) * 0.05) // inset from the corner
  const s = 13 // crosshair arm length
  const r = 6 // ring radius
  const marks: Array<[number, number]> = [
    [m, m],
    [w - m, m],
    [m, h - m],
    [w - m, h - m],
  ]
  for (const [mx, my] of marks) {
    ctx.beginPath()
    ctx.moveTo(mx - s, my)
    ctx.lineTo(mx + s, my)
    ctx.moveTo(mx, my - s)
    ctx.lineTo(mx, my + s)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(mx, my, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

// Draw one channel's halftone dots, rotated to its screen angle, revealed by the
// squeegee sweep and offset by its (easing-out) mis-registration. C/M/Y use
// "multiply" so colour builds subtractively on the white paper; K is near-opaque.
function drawChannelDots(
  ctx: CanvasRenderingContext2D,
  dots: Dot[],
  box: { x: number; y: number; w: number; h: number },
  channel: ChannelKey,
  reveal: number,
  register: number,
  globalAlpha: number
) {
  if (reveal <= 0 || dots.length === 0 || globalAlpha <= 0) return

  // Mis-registration: a few px offset + a hair of rotation that eases to zero.
  const misAmt = (1 - register) // 1 → fully mis-registered, 0 → registered
  // Per-channel offset direction so the channels don't all slide the same way.
  const dir = { c: -1, m: 1, y: -1, k: 1 }[channel]
  const offX = dir * TUNING.misRegPx * misAmt
  const offY = dir * TUNING.misRegPx * 0.6 * misAmt
  const angle =
    (TUNING.angles[channel] * Math.PI) / 180 +
    (dir * TUNING.misRegRotDeg * Math.PI) / 180 * misAmt

  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  ctx.save()
  ctx.globalAlpha = globalAlpha
  ctx.globalCompositeOperation = channel === "k" ? "source-over" : "multiply"
  ctx.fillStyle = INK[channel]

  for (let i = 0; i < dots.length; i++) {
    const d = dots[i]
    // Reveal: a dot appears once the squeegee head has passed its column. A small
    // feather (0.06) makes dots fade in just behind the bar rather than pop.
    const local = clamp01((reveal - d.sweepU) / 0.06 + 0.0)
    if (local <= 0) continue
    const r = d.rMax * smoother(local)
    if (r < 0.25) continue

    // Rotate the dot's position about the art centre by the screen angle so the
    // four screens sit at different angles → rosette where they overlap.
    const rx = d.x - cx
    const ry = d.y - cy
    const x = cx + rx * cos - ry * sin + offX
    const y = cy + rx * sin + ry * cos + offY

    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// The full printed image (all channels' dots) at the current frame, optionally
// cross-faded into the solid coloured mark. Returns nothing; draws onto ctx.
function drawPrintedImage(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  frame: FrameState
) {
  const dotAlpha = (1 - frame.solidMix) * frame.printAlpha
  if (dotAlpha > 0.001) {
    for (const ch of CHANNEL_ORDER) {
      drawChannelDots(
        ctx,
        geo.dots[ch],
        geo.box,
        ch,
        frame.reveal[ch],
        frame.register[ch],
        dotAlpha
      )
    }
  }

  // Solid-fill reward beat: the coloured mark as flat pixels over the dots.
  const solidAlpha = frame.solidMix * frame.printAlpha
  if (solidAlpha > 0.001) {
    ctx.save()
    ctx.globalAlpha = solidAlpha
    for (let i = 0; i < geo.solid.length; i++) {
      const p = geo.solid[i]
      ctx.fillStyle = p.color
      ctx.fillRect(
        Math.round(p.x - p.size / 2),
        Math.round(p.y - p.size / 2),
        Math.ceil(p.size),
        Math.ceil(p.size)
      )
    }
    ctx.restore()
  }
}

// The loupe: a magnified circular window over the printed image at the cursor.
function drawLoupe(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  frame: FrameState,
  w: number,
  h: number,
  mx: number,
  my: number
) {
  const R = TUNING.loupeRadius
  const Z = TUNING.loupeZoom
  ctx.save()
  // Clip to the loupe circle.
  ctx.beginPath()
  ctx.arc(mx, my, R, 0, Math.PI * 2)
  ctx.clip()

  // Fresh paper inside the loupe so multiply has white to build on.
  ctx.fillStyle = PAPER
  ctx.fillRect(mx - R, my - R, R * 2, R * 2)

  // Magnify about the cursor: translate so (mx,my) stays put, then scale.
  ctx.translate(mx, my)
  ctx.scale(Z, Z)
  ctx.translate(-mx, -my)
  // Re-centre the magnified content on the cursor (shift world so the point under
  // the cursor maps to the cursor after zoom).
  ctx.translate((mx * (Z - 1)) / Z, (my * (Z - 1)) / Z)

  drawPrintedImage(ctx, geo, frame)
  ctx.restore()

  // Loupe ring + soft shadow lip.
  ctx.save()
  ctx.beginPath()
  ctx.arc(mx, my, R, 0, Math.PI * 2)
  ctx.lineWidth = 3
  ctx.strokeStyle = "rgba(26,26,46,0.85)"
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(mx, my, R - 2.5, 0, Math.PI * 2)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = "rgba(61,207,194,0.6)" // teal inner accent
  ctx.stroke()
  ctx.restore()
}

// Squeegee bar for the active channel: a dark rounded bar with a highlight,
// sweeping left→right across the art box.
function drawSqueegee(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  channel: ChannelKey,
  sweepFrac: number
) {
  // Map sweep fraction to an x across the box (with a little over-travel so the
  // bar fully clears the right edge at the end).
  const pad = box.w * 0.08
  const x = box.x - pad + sweepFrac * (box.w + pad * 2)
  const top = box.y - box.h * 0.12
  const bot = box.y + box.h * 1.12
  const barW = Math.max(10, box.w * 0.035)

  ctx.save()
  // Soft cast shadow ahead of the bar.
  ctx.globalAlpha = 0.12
  ctx.fillStyle = "#000"
  ctx.fillRect(x - barW * 0.5, top, barW * 2.6, bot - top)
  ctx.globalAlpha = 1

  // The squeegee body — rounded dark bar tinted by the active channel's ink.
  const grad = ctx.createLinearGradient(x - barW, 0, x + barW, 0)
  grad.addColorStop(0, "rgba(20,20,30,0.95)")
  grad.addColorStop(0.5, INK[channel])
  grad.addColorStop(1, "rgba(20,20,30,0.95)")
  roundedRect(ctx, x - barW / 2, top, barW, bot - top, barW * 0.45)
  ctx.fillStyle = grad
  ctx.globalAlpha = 0.9
  ctx.fill()

  // Specular highlight line down the leading edge.
  ctx.globalAlpha = 0.85
  ctx.strokeStyle = "rgba(255,255,255,0.55)"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - barW * 0.22, top + 3)
  ctx.lineTo(x - barW * 0.22, bot - 3)
  ctx.stroke()
  ctx.restore()
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// The little C M Y K swatch strip that lights up as each channel lays down.
function drawChannelIndicator(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: FrameState
) {
  const sw = 18
  const gap = 8
  const totalW = CHANNEL_ORDER.length * sw + (CHANNEL_ORDER.length - 1) * gap
  const x0 = w - totalW - 24
  const y0 = 24
  ctx.save()
  ctx.font = "600 10px ui-sans-serif, system-ui, -apple-system, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (let i = 0; i < CHANNEL_ORDER.length; i++) {
    const ch = CHANNEL_ORDER[i]
    const x = x0 + i * (sw + gap)
    const lit = frame.reveal[ch] > 0
    const done = frame.reveal[ch] >= 1 && frame.register[ch] >= 1
    // Swatch.
    ctx.globalAlpha = lit ? 1 : 0.28
    roundedRect(ctx, x, y0, sw, sw, 4)
    ctx.fillStyle = INK[ch]
    ctx.fill()
    // Registered tick / active ring.
    if (done) {
      ctx.globalAlpha = 1
      ctx.strokeStyle = "rgba(26,26,46,0.85)"
      ctx.lineWidth = 1.5
      roundedRect(ctx, x - 1.5, y0 - 1.5, sw + 3, sw + 3, 5)
      ctx.stroke()
    }
    // Label.
    ctx.globalAlpha = lit ? 1 : 0.6
    ctx.fillStyle = ch === "y" ? "rgba(60,60,40,0.9)" : "rgba(255,255,255,0.95)"
    ctx.fillText(CHANNEL_LABEL[ch], x + sw / 2, y0 + sw / 2 + 0.5)
  }
  ctx.restore()
}

// Compose the full frame.
function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  geo: Geometry,
  frame: FrameState,
  mouse: { x: number; y: number; active: boolean }
) {
  drawPaper(ctx, w, h)

  if (!geo.ready) {
    // Image not yet sampled — paper + crosshairs only (no flash of nothing).
    return
  }

  drawPrintedImage(ctx, geo, frame)

  // Active squeegee bar (only during a sweep, and not once we're cross-fading).
  if (frame.activeChannel && frame.squeegeeX !== null && frame.solidMix < 0.01) {
    drawSqueegee(ctx, geo.box, frame.activeChannel, frame.squeegeeX)
  }

  // Loupe over everything (only when the pointer has moved into the panel).
  if (mouse.active) {
    drawLoupe(ctx, geo, frame, w, h, mouse.x, mouse.y)
  }

  drawChannelIndicator(ctx, w, h, frame)
}

// ─── Component ─────────────────────────────────────────────────────────────────
type Props = { className?: string; style?: React.CSSProperties }

export default function ScreenprintCmykHero({ className, style }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const pausedRef = useRef(false)
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 })

  const imgRef = useRef<HTMLImageElement | null>(null)
  const readyRef = useRef(false) // true once the logo image has loaded
  const geoRef = useRef<Geometry>(EMPTY_GEOMETRY)
  const startRef = useRef<number>(0) // performance.now() at loop start (for elapsed)
  const lastRef = useRef<number>(0)
  const elapsedRef = useRef<number>(0) // dt-accumulated loop time (ms), clamped
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false })

  // Size the canvas to its parent in device pixels (DPR capped at 2).
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return null
    const w = wrap.clientWidth || window.innerWidth
    const h = wrap.clientHeight || window.innerHeight
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext("2d")
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    sizeRef.current = { w, h, dpr }
    return { w, h }
  }, [])

  // Rebuild halftone geometry for the current size (only if the image is ready).
  const rebuildGeometry = useCallback(() => {
    const img = imgRef.current
    const { w, h } = sizeRef.current
    if (!img || !readyRef.current || w <= 0 || h <= 0) {
      geoRef.current = EMPTY_GEOMETRY
      return
    }
    geoRef.current = buildGeometry(img, w, h)
  }, [])

  // Paint a single frame at the given elapsed time (used for the static frame,
  // reduced-motion, and the paused/resize repaint).
  const paintAt = useCallback((elapsed: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const { w, h } = sizeRef.current
    if (w <= 0 || h <= 0) return
    const frame = computeFrame(elapsed)
    drawScene(ctx, w, h, geoRef.current, frame, mouseRef.current)
  }, [])

  const runLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const tick = (now: number) => {
      const { w, h } = sizeRef.current
      if (!pausedRef.current && w > 0 && h > 0) {
        let dt = now - lastRef.current
        // Clamp so a backgrounded tab / GC pause can't teleport the sequence.
        if (dt > 60) dt = 60
        if (dt < 0) dt = 0
        elapsedRef.current = (elapsedRef.current + dt) % LOOP_MS
        const frame = computeFrame(elapsedRef.current)
        drawScene(ctx, w, h, geoRef.current, frame, mouseRef.current)
      }
      lastRef.current = now
      rafRef.current = requestAnimationFrame(tick)
    }
    lastRef.current = performance.now()
    startRef.current = lastRef.current
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const dims = resize()
    if (!dims) return

    // Paint one static frame immediately (paper + crosshairs) so the panel is
    // never blank while the logo image loads.
    paintAt(0)

    let reducedMotion = false
    try {
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    } catch {
      reducedMotion = false
    }

    // ── Load the logo image. Same-origin so getImageData is NOT tainted. ──
    // Black art on transparent → alpha is the ink mask we sample over the brand
    // gradient. (We do NOT use the white variant here: our paper is light.)
    const img = new Image()
    img.decoding = "async"
    img.src = "/branding/sc-prints-logo-transparent.png"
    imgRef.current = img
    img.onload = () => {
      readyRef.current = true
      rebuildGeometry()
      // Repaint: reduced-motion → finished rosette static frame; else first frame.
      if (reducedMotion) {
        // Fully-registered, all channels down, dots (not solid) — the rosette.
        const channelsTotal =
          CHANNEL_ORDER.length * (T.perChannelSweep + T.betweenChannels)
        paintAt(channelsTotal + T.holdRosette * 0.5)
      } else if (pausedRef.current) {
        paintAt(elapsedRef.current)
      } else {
        paintAt(elapsedRef.current)
      }
    }
    img.onerror = () => {
      // Leave readyRef false; scene keeps painting paper + crosshairs gracefully.
      readyRef.current = false
    }

    // ── Pointer (loupe) handlers on the WRAP element. Subtle; off until move. ──
    const toLocal = (clientX: number, clientY: number) => {
      const rect = wrap.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    }
    const onPointerMove = (e: PointerEvent) => {
      const p = toLocal(e.clientX, e.clientY)
      mouseRef.current = { x: p.x, y: p.y, active: true }
      // If paused/reduced-motion, repaint so the loupe still tracks on hover.
      if (reducedMotion || pausedRef.current) {
        const channelsTotal =
          CHANNEL_ORDER.length * (T.perChannelSweep + T.betweenChannels)
        paintAt(reducedMotion ? channelsTotal + T.holdRosette * 0.5 : elapsedRef.current)
      }
    }
    const onPointerLeave = () => {
      mouseRef.current = { ...mouseRef.current, active: false }
      if (reducedMotion || pausedRef.current) {
        const channelsTotal =
          CHANNEL_ORDER.length * (T.perChannelSweep + T.betweenChannels)
        paintAt(reducedMotion ? channelsTotal + T.holdRosette * 0.5 : elapsedRef.current)
      }
    }
    wrap.addEventListener("pointermove", onPointerMove, { passive: true })
    wrap.addEventListener("pointerleave", onPointerLeave, { passive: true })

    // ── Debounced resize → re-size + rebuild geometry; repaint if static. ──
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const d = resize()
        if (!d) return
        rebuildGeometry()
        if (reducedMotion || pausedRef.current) {
          const channelsTotal =
            CHANNEL_ORDER.length * (T.perChannelSweep + T.betweenChannels)
          paintAt(reducedMotion ? channelsTotal + T.holdRosette * 0.5 : elapsedRef.current)
        }
      }, 180)
    }
    window.addEventListener("resize", onResize, { passive: true })

    if (reducedMotion) {
      // No rAF loop. The onload handler paints the finished rosette static frame.
      return () => {
        window.removeEventListener("resize", onResize)
        wrap.removeEventListener("pointermove", onPointerMove)
        wrap.removeEventListener("pointerleave", onPointerLeave)
        if (resizeTimer) clearTimeout(resizeTimer)
        img.onload = null
        img.onerror = null
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        pausedRef.current = !entry.isIntersecting
      },
      { threshold: 0 }
    )
    observer.observe(canvas)

    // Defer the rAF loop to idle so the pixel churn doesn't fight first paint.
    let idleHandle: number | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    type Ric = (cb: () => void, opts?: { timeout?: number }) => number
    const ric = (window as unknown as { requestIdleCallback?: Ric }).requestIdleCallback
    if (typeof ric === "function") {
      idleHandle = ric(() => runLoop(), { timeout: 2000 })
    } else {
      timeoutHandle = setTimeout(() => runLoop(), 1200)
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      observer.disconnect()
      window.removeEventListener("resize", onResize)
      wrap.removeEventListener("pointermove", onPointerMove)
      wrap.removeEventListener("pointerleave", onPointerLeave)
      if (resizeTimer) clearTimeout(resizeTimer)
      img.onload = null
      img.onerror = null
      if (idleHandle !== null) {
        const cancelRic = (window as unknown as { cancelIdleCallback?: (h: number) => void })
          .cancelIdleCallback
        if (typeof cancelRic === "function") cancelRic(idleHandle)
      }
      if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    }
  }, [resize, runLoop, paintAt, rebuildGeometry])

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "600px",
        overflow: "hidden",
        background: PAPER,
        cursor: "crosshair",
        ...style,
      }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, display: "block" }} />

      {/* Technique caption chip — bottom-left pill so the three sandbox pages are
          distinguishable at a glance. Subtle, brand-tinted, non-interactive. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          pointerEvents: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderRadius: 999,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Plus Jakarta Sans", sans-serif',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: "rgba(26,26,46,0.78)",
          background: "rgba(61,207,194,0.16)",
          border: "1px solid rgba(61,207,194,0.42)",
          backdropFilter: "blur(2px)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#ff2e63",
            boxShadow: "0 0 0 2px rgba(255,46,99,0.22)",
          }}
        />
        CMYK screen separation
      </div>
    </div>
  )
}
