"use client"

import React, { useEffect, useRef, useCallback } from "react"

// ─── Palette ────────────────────────────────────────────────────────────────
const BG = "#0B0C10"
const STAR_DIM = "#1F2833"
const STAR_BRIGHT = "#C5C6C7"
const COMET_HEAD = "#FFFFFF"
const COMET_TRAIL = "#45A29E"

// Soft background nebula blobs, coloured from the brand palette (teal accent,
// navy, a faint magenta). Drawn additively + drifting slowly behind the stars
// so the void reads as a deep, rich cosmos rather than flat black.
const NEBULA: {
  x: number; y: number; r: number; color: [number, number, number]
  alpha: number; driftX: number; driftY: number; phase: number
}[] = [
  { x: 0.28, y: 0.34, r: 0.55, color: [40, 96, 100], alpha: 0.16, driftX: 0.00003,  driftY: 0.000021, phase: 0.0 },
  { x: 0.72, y: 0.30, r: 0.50, color: [44, 48, 96],  alpha: 0.14, driftX: 0.000025, driftY: 0.000018, phase: 2.1 },
  { x: 0.55, y: 0.70, r: 0.62, color: [82, 32, 60],  alpha: 0.10, driftX: 0.000018, driftY: 0.000015, phase: 4.0 },
]

// ─── Planet definitions ──────────────────────────────────────────────────────
type PlanetType = "terran" | "arid" | "gas" | "ice" | "lava" | "neon"

interface PlanetDef {
  baseSize: number; scale: number; primary: string; secondary: string
  trailColor: string; orbitRX: number; orbitRY: number; speed: number
  startAngle: number; type: PlanetType
}

// Speeds ~halved from the original for the calmer drift you liked. The two
// genuine clashers retuned toward the brand palette — neon-green → soft magenta,
// the purple/orange gas giant → muted indigo with sandy bands. The rest keep
// their colour for variety.
const PLANET_DEFS: PlanetDef[] = [
  { baseSize: 12, scale: 3, primary: "#C5C6C7", secondary: "#FFFFFF",
    trailColor: "#C5C6C7", orbitRX: 200, orbitRY: 75, speed: 0.00038, startAngle: 3.3, type: "ice" },
  { baseSize: 16, scale: 3, primary: "#D9534F", secondary: "#F0AD4E",
    trailColor: "#D9534F", orbitRX: 310, orbitRY: 115, speed: 0.00022, startAngle: 2.1, type: "arid" },
  { baseSize: 20, scale: 3, primary: "#8B1A1A", secondary: "#FF4500",
    trailColor: "#FF4500", orbitRX: 410, orbitRY: 150, speed: 0.00016, startAngle: 5.5, type: "lava" },
  { baseSize: 32, scale: 3, primary: "#45A29E", secondary: "#66FCF1",
    trailColor: "#45A29E", orbitRX: 510, orbitRY: 185, speed: 0.00011, startAngle: 0.5, type: "terran" },
  { baseSize: 24, scale: 3, primary: "#6E2A4E", secondary: "#FF5FA0",
    trailColor: "#C24A7C", orbitRX: 590, orbitRY: 210, speed: 0.00009, startAngle: 1.2, type: "neon" },
  { baseSize: 48, scale: 2.5, primary: "#4A4570", secondary: "#C9B89A",
    trailColor: "#6A6390", orbitRX: 680, orbitRY: 242, speed: 0.00006, startAngle: 4.0, type: "gas" },
]

// ─── Types ───────────────────────────────────────────────────────────────────
interface TrailParticle {
  x: number; y: number
  vx: number; vy: number       // px / ms — slow cascade drift
  life: number; maxLife: number
  baseSize: number              // size at spawn; rendered size shrinks with life
  color: string
}

interface Planet {
  def: PlanetDef; angle: number; sprite: HTMLCanvasElement
  trail: TrailParticle[]; emitAccum: number
  prevX: number; prevY: number; initialized: boolean
}

interface Comet {
  x: number; y: number; vx: number; vy: number; active: boolean; trailLen: number
}

interface ShootingStar { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; len: number }

interface Flyby {
  x: number; y: number; vx: number; vy: number
  sprite: HTMLCanvasElement; active: boolean; alpha: number; flipped: boolean
  engineX: number; engineY: number  // local coords of engine glow
  engineColor: string
  scale: number
}

interface LogoPixel { lx: number; ly: number }

// 3-layer parallax starfield. Each layer is a pre-rendered offscreen canvas
// that gets blitted twice per frame (with drift offset) so it tiles seamlessly.
// Layered blits + a small twinkler overlay = ~3 drawImage + ~50 fillRect per
// frame on the stars canvas, vs. 1500-3000 fillRect/frame for a redraw-from-
// scratch approach. Cheap on phone and respects DPR.
interface StarLayer {
  canvas: HTMLCanvasElement     // device-pixel sized: w*dpr × h*dpr
  speed: number                 // logical px / ms, horizontal leftward drift
  width: number                 // logical width the layer was built for
}

interface Twinkler {
  x: number; y: number           // logical
  size: number                   // 1 or 2 device-pixel-equivalent
  rgb: [number, number, number]
  phase: number                  // 0..2π
  freq: number                   // rad / ms
  sparkle: boolean               // hero stars get a 4-point glint near peak
}

interface SceneState {
  planets: Planet[]; comets: Comet[]; nextCometMs: number
  shootingStars: ShootingStar[]; nextShootMs: number
  flybys: Flyby[]; flybySprites: HTMLCanvasElement[]; nextFlybyMs: number
  logoImg: HTMLImageElement | null; logoW: number; logoH: number
  logoPixels: LogoPixel[] | null; logoCols: number; logoRows: number; logoPixelSize: number
  earthImg: HTMLImageElement | null; earthFrames: number
  starLayers: StarLayer[]; twinklers: Twinkler[]
}

// ─── Planet sprite helpers ────────────────────────────────────────────────────
function circleFill(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, inset = 0) {
  ctx.fillStyle = color
  const ri = r - inset
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5
      if (dx * dx + dy * dy <= ri * ri) ctx.fillRect(x, y, 1, 1)
    }
}

function drawTerranSprite(size: number, primary: string, secondary: string): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = size; c.height = size
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false; const r = size / 2
  circleFill(ctx, r, r, r, primary)
  ctx.fillStyle = secondary
  const bY = Math.floor(size * 0.28), bH = Math.max(1, Math.floor(size * 0.13))
  for (let y = bY; y < bY + bH; y++) for (let x = 0; x < size; x++) {
    const dx = x - r + 0.5, dy = y - r + 0.5
    if (dx * dx + dy * dy <= (r - 1) * (r - 1)) ctx.fillRect(x, y, 1, 1)
  }
  ctx.fillStyle = "rgba(0,0,0,0.38)"
  for (let y = 0; y < size; y++) for (let x = Math.floor(r * 1.1); x < size; x++) {
    const dx = x - r + 0.5, dy = y - r + 0.5
    if (dx * dx + dy * dy <= r * r) ctx.fillRect(x, y, 1, 1)
  }
  return c
}

function drawAridSprite(size: number, primary: string, secondary: string): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = size; c.height = size
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false; const r = size / 2
  circleFill(ctx, r, r, r, primary)
  const spots: [number, number, number][] = [[Math.floor(size*0.3),Math.floor(size*0.4),2],[Math.floor(size*0.6),Math.floor(size*0.3),1],[Math.floor(size*0.45),Math.floor(size*0.62),2]]
  for (const [sx, sy, sr] of spots) for (let dy = -sr; dy <= sr; dy++) for (let dx = -sr; dx <= sr; dx++)
    if (dx*dx+dy*dy <= sr*sr) { const px=sx+dx, py=sy+dy; if (px>=0&&px<size&&py>=0&&py<size) { ctx.fillStyle=secondary; ctx.fillRect(px,py,1,1) } }
  ctx.fillStyle = "rgba(0,0,0,0.4)"
  for (let y = 0; y < size; y++) for (let x = Math.floor(r*1.15); x < size; x++) {
    const dx = x-r+0.5, dy = y-r+0.5; if (dx*dx+dy*dy <= r*r) ctx.fillRect(x,y,1,1)
  }
  return c
}

function drawLavaSprite(size: number, primary: string, secondary: string): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = size; c.height = size
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false; const r = size / 2
  circleFill(ctx, r, r, r, primary)
  ctx.fillStyle = secondary
  const cracks: [number,number,number,number][] = [[Math.floor(r*.5),Math.floor(r*.4),Math.floor(r*1.3),Math.floor(r*.9)],[Math.floor(r*.8),Math.floor(r*1.1),Math.floor(r*1.5),Math.floor(r*1.6)],[Math.floor(r*.4),Math.floor(r*1.3),Math.floor(r*.9),Math.floor(r*1.8)]]
  for (const [x1,y1,x2,y2] of cracks) { const steps=Math.max(Math.abs(x2-x1),Math.abs(y2-y1)); for (let i=0;i<=steps;i++) { const px=Math.round(x1+(x2-x1)*(i/steps)),py=Math.round(y1+(y2-y1)*(i/steps)); const dx=px-r+.5,dy=py-r+.5; if (dx*dx+dy*dy<=(r-1)*(r-1)) ctx.fillRect(px,py,1,1) } }
  ctx.fillStyle = "rgba(0,0,0,0.5)"
  for (let y=0;y<size;y++) for (let x=Math.floor(r*1.1);x<size;x++) { const dx=x-r+.5,dy=y-r+.5; if (dx*dx+dy*dy<=r*r) ctx.fillRect(x,y,1,1) }
  return c
}

function drawNeonSprite(size: number, primary: string, secondary: string): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = size; c.height = size
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false; const r = size / 2
  circleFill(ctx, r, r, r, primary)
  ctx.fillStyle = secondary
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) { const dx=x-r+.5,dy=y-r+.5,d2=dx*dx+dy*dy; if (d2<=r*r&&d2>=(r-2.5)*(r-2.5)) ctx.fillRect(x,y,1,1) }
  circleFill(ctx, Math.floor(r*.55), Math.floor(r*.45), Math.max(1,Math.floor(r*.28)), secondary)
  ctx.fillStyle = "rgba(0,0,0,0.45)"
  for (let y=0;y<size;y++) for (let x=Math.floor(r*1.1);x<size;x++) { const dx=x-r+.5,dy=y-r+.5; if (dx*dx+dy*dy<=r*r) ctx.fillRect(x,y,1,1) }
  return c
}

function drawGasSprite(size: number, primary: string, secondary: string): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = size*2; c.height = size
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false
  const cx=size,cy=size/2,r=size/2
  for (const [rx2,ry2,lw,col] of [[Math.floor(size*.88),Math.floor(size*.21),Math.max(1,Math.floor(size*.06)),secondary],[Math.floor(size*.76),Math.floor(size*.17),Math.max(1,Math.floor(size*.04)),primary]] as [number,number,number,string][]) { ctx.strokeStyle=col; ctx.lineWidth=lw; ctx.beginPath(); ctx.ellipse(cx,cy,rx2,ry2,0,0,Math.PI*2); ctx.stroke() }
  circleFill(ctx,cx,cy,r,primary)
  for (const [bf,col] of [[.22,secondary],[.46,`${secondary}99`],[.66,secondary],[.81,`${secondary}77`]] as [number,string][]) { ctx.fillStyle=col; const by=Math.floor(cy-r+size*bf),bh=Math.max(1,Math.floor(size*.07)); for (let y=by;y<by+bh;y++) for (let x=cx-Math.floor(r);x<=cx+Math.floor(r);x++) { const dx=x-cx+.5,dy=y-cy+.5; if (dx*dx+dy*dy<=(r-1)*(r-1)) ctx.fillRect(x,y,1,1) } }
  ctx.fillStyle="rgba(0,0,0,0.4)"
  for (let y=0;y<size;y++) for (let x=cx;x<=cx+Math.floor(r);x++) { const dx=x-cx+.5,dy=y-cy+.5; if (dx*dx+dy*dy<=r*r) ctx.fillRect(x,y,1,1) }
  return c
}

function drawIceSprite(size: number, primary: string, secondary: string): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = size; c.height = size
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false; const r = size / 2
  circleFill(ctx,r,r,r,primary)
  circleFill(ctx,Math.floor(r*.62),Math.floor(r*.52),Math.max(1,Math.floor(r*.38)),secondary)
  ctx.fillStyle="rgba(0,0,0,0.32)"
  for (let y=0;y<size;y++) for (let x=Math.floor(r*1.05);x<size;x++) { const dx=x-r+.5,dy=y-r+.5; if (dx*dx+dy*dy<=r*r) ctx.fillRect(x,y,1,1) }
  return c
}

function makeSprite(def: PlanetDef): HTMLCanvasElement {
  switch (def.type) {
    case "terran": return drawTerranSprite(def.baseSize, def.primary, def.secondary)
    case "arid":   return drawAridSprite(def.baseSize, def.primary, def.secondary)
    case "lava":   return drawLavaSprite(def.baseSize, def.primary, def.secondary)
    case "neon":   return drawNeonSprite(def.baseSize, def.primary, def.secondary)
    case "gas":    return drawGasSprite(def.baseSize, def.primary, def.secondary)
    case "ice":    return drawIceSprite(def.baseSize, def.primary, def.secondary)
  }
}

// ─── Ship sprite generators ───────────────────────────────────────────────────
// All ships face RIGHT. The flyby system flips them for leftward travel via ctx.scale(-1,1).

function makeShuttleSprite(): HTMLCanvasElement {
  // Side view, nose = right, 46w × 10h
  const W = 46, H = 10
  const c = document.createElement("canvas"); c.width = W; c.height = H
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false
  const midY = Math.floor(H / 2)

  // Delta wing: wider at back (left), narrows to nose (right) via scanlines
  for (let x = 0; x < W - 2; x++) {
    const t = x / (W - 3) // 0=back 1=nose
    const half = Math.round(4 * (1 - t))
    if (half === 0) continue
    ctx.fillStyle = "#DDDDDD"
    ctx.fillRect(x, midY - half, 1, half * 2)
    // Heat tiles on bottom ~60% from back
    if (t < 0.65 && half >= 2) {
      ctx.fillStyle = "#334488"
      ctx.fillRect(x, midY + half - 2, 1, 2)
    }
  }
  // Nose tip
  ctx.fillStyle = "#DDDDDD"
  ctx.fillRect(W - 3, midY, 3, 1)
  ctx.fillRect(W - 2, midY - 1, 2, 3)
  // Cockpit windows
  ctx.fillStyle = "#66CCEE"
  ctx.fillRect(W - 14, midY - 2, 5, 2)
  // Engine nozzles (left end)
  ctx.fillStyle = "#88AAFF"
  ctx.fillRect(0, midY - 3, 3, 2)
  ctx.fillRect(0, midY + 1, 3, 2)
  ctx.fillStyle = "#AACCFF"
  ctx.fillRect(0, midY - 1, 2, 2)
  return c
}

function makeEnterpriseSprite(): HTMLCanvasElement {
  // Top-down view, nose = right, 58w × 16h
  const W = 58, H = 16
  const c = document.createElement("canvas"); c.width = W; c.height = H
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false
  const midY = H / 2

  // Saucer section (oval, right side)
  const sCX = W - 18, sRX = 17, sRY = 7
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - sCX) / sRX, dy = (y - midY) / sRY
    if (dx * dx + dy * dy <= 1) { ctx.fillStyle = "#CCCCCC"; ctx.fillRect(x, y, 1, 1) }
  }
  // Saucer dome highlight
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - sCX + 3) / (sRX * 0.6), dy = (y - midY + 1) / (sRY * 0.55)
    if (dx * dx + dy * dy <= 1) { ctx.fillStyle = "#E8E8E8"; ctx.fillRect(x, y, 1, 1) }
  }
  // Secondary hull (rectangular, center-left)
  ctx.fillStyle = "#AAAAAA"
  ctx.fillRect(12, Math.floor(midY) - 2, 26, 4)
  // Nacelles (2 thin bars, top & bottom)
  ctx.fillStyle = "#8899BB"
  ctx.fillRect(0, 1, 34, 3)       // top nacelle
  ctx.fillRect(0, H - 4, 34, 3)   // bottom nacelle
  // Nacelle engine glows
  ctx.fillStyle = "#4466FF"
  ctx.fillRect(0, 2, 4, 2)
  ctx.fillRect(0, H - 3, 4, 2)
  // Neck (connecting saucer to hull)
  ctx.fillStyle = "#999999"
  ctx.fillRect(37, Math.floor(midY) - 1, 5, 2)
  return c
}

function makeXWingSprite(): HTMLCanvasElement {
  // Side view, nose = right, 44w × 18h
  const W = 44, H = 18
  const c = document.createElement("canvas"); c.width = W; c.height = H
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false
  const midY = Math.floor(H / 2)

  // Fuselage
  ctx.fillStyle = "#CCCCCC"
  ctx.fillRect(2, midY - 1, W - 4, 3)
  // Pointed nose
  ctx.fillRect(W - 4, midY, 4, 1)
  ctx.fillRect(W - 3, midY - 1, 3, 3)
  // Cockpit canopy
  ctx.fillStyle = "#334466"
  ctx.fillRect(W - 16, midY - 2, 6, 2)
  ctx.fillStyle = "#4466AA"
  ctx.fillRect(W - 15, midY - 2, 4, 1)
  // R2-D2 dome
  ctx.fillStyle = "#AACCEE"
  ctx.fillRect(W - 22, midY - 2, 4, 3)

  // Wing attachment point ~40% from back
  const wx = 10
  // Top wings (fan upward from wx)
  ctx.fillStyle = "#BBBBBB"
  ctx.fillRect(wx, midY - 3, 18, 1)   // near-top wing
  ctx.fillRect(wx - 2, midY - 6, 18, 1) // far-top wing
  // Bottom wings
  ctx.fillRect(wx, midY + 3, 18, 1)   // near-bottom wing
  ctx.fillRect(wx - 2, midY + 5, 18, 1) // far-bottom wing
  // Red stripes
  ctx.fillStyle = "#CC2222"
  ctx.fillRect(wx + 4, midY - 3, 6, 1)
  ctx.fillRect(wx + 4, midY + 3, 6, 1)
  ctx.fillRect(wx + 2, midY - 6, 6, 1)
  ctx.fillRect(wx + 2, midY + 5, 6, 1)
  // Engine glow (back left)
  ctx.fillStyle = "#FF8800"
  ctx.fillRect(0, midY - 1, 4, 3)
  ctx.fillStyle = "#FFCC44"
  ctx.fillRect(0, midY, 2, 1)
  return c
}

function makeFalconSprite(): HTMLCanvasElement {
  // Top-down view, 40w × 30h, nose = right
  const W = 40, H = 30
  const c = document.createElement("canvas"); c.width = W; c.height = H
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false
  const cx = W / 2 - 2, cy = H / 2

  // Main disc
  const rX = 16, rY = 13
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / rX, dy = (y - cy) / rY
    if (dx * dx + dy * dy <= 1) { ctx.fillStyle = "#887766"; ctx.fillRect(x, y, 1, 1) }
  }
  // Panel lines (darker cross)
  ctx.fillStyle = "#554433"
  ctx.fillRect(cx - 12, cy - 1, 24, 1)
  ctx.fillRect(cx - 1, cy - 10, 1, 20)
  ctx.fillRect(cx - 8, cy - 8, 1, 16)
  ctx.fillRect(cx + 6, cy - 8, 1, 16)
  // Disc highlight
  ctx.fillStyle = "#AA9988"
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx + 3) / (rX * 0.55), dy = (y - cy + 2) / (rY * 0.5)
    if (dx * dx + dy * dy <= 1) { ctx.fillStyle = "#998877"; ctx.fillRect(x, y, 1, 1) }
  }
  // Front mandibles (right side, creates the fork shape)
  ctx.clearRect(cx + 10, cy - 4, 9, 3)
  ctx.clearRect(cx + 10, cy + 1, 9, 3)
  // Mandible detail
  ctx.fillStyle = "#665544"
  ctx.fillRect(cx + 10, cy - 6, 8, 2)
  ctx.fillRect(cx + 10, cy + 4, 8, 2)
  // Cockpit blister (upper right of disc)
  ctx.fillStyle = "#334466"
  ctx.fillRect(cx + 4, cy - 9, 6, 4)
  ctx.fillStyle = "#4466AA"
  ctx.fillRect(cx + 5, cy - 8, 4, 2)
  // Engine glow (back left)
  ctx.fillStyle = "#4488FF"
  ctx.fillRect(cx - rX + 1, cy - 2, 4, 4)
  ctx.fillStyle = "#88AAFF"
  ctx.fillRect(cx - rX + 1, cy - 1, 3, 2)
  return c
}

function makeTIESprite(): HTMLCanvasElement {
  // Front 3/4 view, 34w × 28h
  const W = 34, H = 28
  const c = document.createElement("canvas"); c.width = W; c.height = H
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false
  const cx = W / 2, cy = H / 2

  // Solar panels — left panel (hexagonal approximation)
  ctx.fillStyle = "#1A3322"
  for (const [x, y, w, h] of [[0,6,4,16],[4,3,4,22],[8,1,3,26],[11,3,2,22]] as [number,number,number,number][])
    ctx.fillRect(x, y, w, h)
  // Panel grid lines
  ctx.fillStyle = "#2A5533"
  for (let row = 0; row < 5; row++) ctx.fillRect(0, 5 + row * 4, 13, 1)

  // Solar panels — right panel (mirror)
  ctx.fillStyle = "#1A3322"
  for (const [x, y, w, h] of [[30,6,4,16],[26,3,4,22],[23,1,3,26],[21,3,2,22]] as [number,number,number,number][])
    ctx.fillRect(x, y, w, h)
  ctx.fillStyle = "#2A5533"
  for (let row = 0; row < 5; row++) ctx.fillRect(21, 5 + row * 4, 13, 1)

  // Struts
  ctx.fillStyle = "#555555"
  ctx.fillRect(13, cy - 1, 4, 2)
  ctx.fillRect(17, cy - 1, 4, 2)

  // Cockpit ball
  circleFill(ctx, cx, cy, 5, "#777777")
  circleFill(ctx, cx - 1, cy - 1, 3, "#999999")
  // Viewport
  ctx.fillStyle = "#44FF88"
  ctx.fillRect(cx - 2, cy - 1, 4, 2)
  // Engine glow center
  ctx.fillStyle = "#44FF88"
  circleFill(ctx, cx, cy, 2, "#44FF88")
  ctx.fillStyle = "#AAFFCC"
  ctx.fillRect(cx - 1, cy, 2, 1)
  return c
}

// ─── Ship registry (built once, reused across flybys) ─────────────────────────
interface ShipDef { sprite: HTMLCanvasElement; engineX: number; engineY: number; engineColor: string; scale: number }

function buildShipDefs(): ShipDef[] {
  return [
    { sprite: makeShuttleSprite(),   engineX: 1,   engineY: 5,  engineColor: "#88AAFF", scale: 2.5 },
    { sprite: makeEnterpriseSprite(), engineX: 2,   engineY: 8,  engineColor: "#4466FF", scale: 2   },
    { sprite: makeXWingSprite(),     engineX: 2,   engineY: 9,  engineColor: "#FF8800", scale: 2   },
    { sprite: makeFalconSprite(),    engineX: 4,   engineY: 15, engineColor: "#4488FF", scale: 1.8 },
    { sprite: makeTIESprite(),       engineX: 17,  engineY: 14, engineColor: "#44FF88", scale: 1.8 },
  ]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function randomBetween(a: number, b: number) { return a + Math.random() * (b - a) }

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Soft luminous halo behind a planet so it reads as a lit world, not a flat
// pixel disc. Additive blend; intensity scales with the planet's depth.
function drawPlanetGlow(ctx: CanvasRenderingContext2D, px: number, py: number, radius: number, color: string, intensity: number) {
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

function spawnComet(w: number, h: number): Comet {
  const fromRight = Math.random() > 0.5
  const speed = randomBetween(0.55, 0.85)
  const angle = randomBetween(0.3, 0.6)
  return { x: fromRight ? w + 40 : -40, y: randomBetween(-40, h * 0.4), vx: fromRight ? -Math.cos(angle) * speed : Math.cos(angle) * speed, vy: Math.sin(angle) * speed, active: true, trailLen: randomBetween(80, 140) }
}

function spawnShoot(w: number, h: number): ShootingStar {
  const fromRight = Math.random() > 0.5
  const speed = randomBetween(0.9, 1.4)
  const angle = randomBetween(0.25, 0.5)
  const life = randomBetween(450, 800)
  return {
    x: randomBetween(w * 0.1, w * 0.9), y: randomBetween(-20, h * 0.5),
    vx: (fromRight ? -1 : 1) * Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    life, maxLife: life, len: randomBetween(28, 52),
  }
}

function spawnFlyby(w: number, h: number, shipDefs: ShipDef[]): Flyby {
  const def = shipDefs[Math.floor(Math.random() * shipDefs.length)]
  const fromRight = Math.random() > 0.5
  const speed = randomBetween(0.18, 0.32)
  const angle = randomBetween(0.05, 0.22)  // shallow diagonal
  const vx = fromRight ? -speed : speed
  const vy = randomBetween(-0.06, 0.12)
  const margin = def.sprite.width * def.scale + 20
  const startX = fromRight ? w + margin : -margin
  const startY = randomBetween(h * 0.05, h * 0.75)
  return {
    x: startX, y: startY, vx, vy,
    sprite: def.sprite, active: true,
    alpha: randomBetween(0.55, 0.82),
    flipped: fromRight,
    engineX: def.engineX, engineY: def.engineY,
    engineColor: def.engineColor,
    scale: def.scale,
  }
}

// ─── Parallax starfield ──────────────────────────────────────────────────────
// Three independently-drifting star layers + a small set of twinklers. The
// per-layer offscreen canvases are pre-rendered once (and rebuilt on resize);
// the rAF loop only blits + overdraws twinklers, which keeps per-frame cost
// low even on phone.

function pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function buildStarLayer(
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

function buildStarfield(w: number, h: number, dpr: number): { layers: StarLayer[]; twinklers: Twinkler[] } {
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

function setupStarsCanvasSize(canvas: HTMLCanvasElement, w: number, h: number, dpr: number) {
  canvas.width = Math.max(1, Math.ceil(w * dpr))
  canvas.height = Math.max(1, Math.ceil(h * dpr))
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
}

function paintStarsFrame(
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

function sampleLogoPixels(img: HTMLImageElement, targetCols: number): { pixels: LogoPixel[]; cols: number; rows: number } {
  const cols = targetCols, rows = Math.round(cols * img.naturalHeight / img.naturalWidth)
  const off = document.createElement("canvas"); off.width = cols; off.height = rows
  const ctx = off.getContext("2d")!; ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0, cols, rows)
  const data = ctx.getImageData(0, 0, cols, rows).data
  const pixels: LogoPixel[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
    if (data[(y * cols + x) * 4 + 3] > 80) pixels.push({ lx: x, ly: y })
  return { pixels, cols, rows }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SpaceHero({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const starsCanvasRef = useRef<HTMLCanvasElement>(null)
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const stateRef = useRef<SceneState | null>(null)
  const pausedRef = useRef(false)
  const shipDefsRef = useRef<ShipDef[] | null>(null)
  const pointerTargetRef = useRef({ x: 0, y: 0 })  // normalised −1..1 cursor/tilt offset

  const initScene = useCallback((): SceneState => {
    const planets: Planet[] = PLANET_DEFS.map(def => ({
      def, angle: def.startAngle, sprite: makeSprite(def), trail: [], emitAccum: 0,
      prevX: Math.cos(def.startAngle) * def.orbitRX,
      prevY: Math.sin(def.startAngle) * def.orbitRY,
      initialized: false,
    }))
    const logoImg = new Image(); logoImg.src = "/branding/sc-prints-logo-transparent.png"
    const earthImg = new Image()
    earthImg.src = "/branding/earth-spritesheet.png"
    earthImg.onload = () => { if (stateRef.current) stateRef.current.earthFrames = Math.round(earthImg.naturalWidth / earthImg.naturalHeight) }
    return { planets, comets: [], nextCometMs: randomBetween(3000, 7000), shootingStars: [], nextShootMs: randomBetween(1500, 4000), flybys: [], flybySprites: [], nextFlybyMs: randomBetween(8000, 18000), logoImg, logoW: 0, logoH: 0, logoPixels: null, logoCols: 0, logoRows: 0, logoPixelSize: 0, earthImg, earthFrames: 0, starLayers: [], twinklers: [] }
  }, [])

  const getOrbitScale = (w: number) => w < 480 ? 0.35 : w < 768 ? 0.55 : 1.0
  const getVisibleCount = (w: number) => w < 480 ? 2 : w < 768 ? 4 : 6

  const runLoop = useCallback(() => {
    const starsCanvas = starsCanvasRef.current
    const sceneCanvas = sceneCanvasRef.current
    if (!starsCanvas || !sceneCanvas) return

    const dpr = window.devicePixelRatio || 1
    let w = starsCanvas.parentElement?.clientWidth ?? window.innerWidth
    let h = starsCanvas.parentElement?.clientHeight ?? window.innerHeight

    sceneCanvas.width = w * dpr; sceneCanvas.height = h * dpr
    sceneCanvas.style.width = `${w}px`; sceneCanvas.style.height = `${h}px`
    setupStarsCanvasSize(starsCanvas, w, h, dpr)

    const state = stateRef.current!
    const ctx = sceneCanvas.getContext("2d")!
    ctx.scale(dpr, dpr)

    const initStarfield = () => {
      const built = buildStarfield(w, h, dpr)
      state.starLayers = built.layers
      state.twinklers = built.twinklers
    }
    initStarfield()
    // Paint one static frame immediately so the hero is visible before the
    // rAF tick begins (mirrors the original drawStars() init behaviour).
    paintStarsFrame(starsCanvas, w, h, dpr, state.starLayers, state.twinklers, 0)

    let lastTs = performance.now(), elapsed = 0
    let plxX = 0, plxY = 0, logoIntro = 0   // eased parallax + one-shot logo reveal

    const LOGO_SAMPLE_COLS = 72, LOGO_DISPLAY_COLS = 64
    const EARTH_FRAME_MS = 130  // slowed from 80 → ~3.9 s/rotation for a calmer spin

    const calcLogoSize = () => {
      if (!state.logoImg || state.logoImg.naturalWidth === 0) return
      state.logoPixelSize = Math.max(3, Math.round(Math.min(w * 0.006, 5.5)))
      state.logoCols = LOGO_DISPLAY_COLS
      state.logoW = state.logoCols * state.logoPixelSize
      state.logoRows = Math.round(state.logoCols * state.logoImg.naturalHeight / state.logoImg.naturalWidth)
      state.logoH = state.logoRows * state.logoPixelSize
    }

    const doSampleLogo = () => {
      if (!state.logoImg || state.logoImg.naturalWidth === 0) return
      const { pixels, cols } = sampleLogoPixels(state.logoImg, LOGO_SAMPLE_COLS)
      const scale = LOGO_DISPLAY_COLS / cols
      const seen = new Set<string>()
      state.logoPixels = pixels.map(p => ({ lx: Math.round(p.lx * scale), ly: Math.round(p.ly * scale) }))
        .filter(p => { const k = `${p.lx},${p.ly}`; if (seen.has(k)) return false; seen.add(k); return true })
    }

    const initLogo = () => { calcLogoSize(); doSampleLogo() }
    if (state.logoImg && !state.logoImg.complete) { state.logoImg.onload = initLogo } else if (state.logoImg) { initLogo() }

    const tick = (ts: number) => {
      if (pausedRef.current) { rafRef.current = requestAnimationFrame(tick); return }

      const delta = Math.min(ts - lastTs, 50)
      lastTs = ts; elapsed += delta

      const newW = starsCanvas.parentElement?.clientWidth ?? window.innerWidth
      const newH = starsCanvas.parentElement?.clientHeight ?? window.innerHeight
      if (newW !== w || newH !== h) {
        w = newW; h = newH
        sceneCanvas.width = w * dpr; sceneCanvas.height = h * dpr
        sceneCanvas.style.width = `${w}px`; sceneCanvas.style.height = `${h}px`
        ctx.scale(dpr, dpr)
        setupStarsCanvasSize(starsCanvas, w, h, dpr)
        initStarfield()
        calcLogoSize()
      }

      // Ease parallax toward the pointer/tilt target; advance the logo reveal.
      const pt = pointerTargetRef.current
      plxX += (pt.x - plxX) * 0.06
      plxY += (pt.y - plxY) * 0.06
      if (state.logoPixels && state.logoPixels.length > 0) logoIntro = Math.min(1, logoIntro + delta / 900)

      // Parallax starfield — blit pre-rendered layers with drift offsets +
      // overdraw twinklers. Painted on its own canvas below the scene canvas.
      paintStarsFrame(starsCanvas, w, h, dpr, state.starLayers, state.twinklers, elapsed, plxX)

      const cx = w / 2 - plxX * 26, cy = h / 2 - plxY * 26
      const orbitScale = getOrbitScale(w)
      const visibleCount = getVisibleCount(w)
      const floatY = Math.sin(elapsed * 0.0005) * 7

      ctx.clearRect(0, 0, w, h)

      // ── Comets ───────────────────────────────────────────────────────────────
      state.nextCometMs -= delta
      if (state.nextCometMs <= 0) {
        if (state.comets.filter(c => c.active).length < 2) state.comets.push(spawnComet(w, h))
        state.nextCometMs = randomBetween(5000, 12000)
      }
      for (const comet of state.comets) {
        if (!comet.active) continue
        comet.x += comet.vx * delta; comet.y += comet.vy * delta
        if (comet.x < -200 || comet.x > w + 200 || comet.y > h + 200) comet.active = false
      }
      while (state.comets.length > 6) state.comets.shift()

      for (const comet of state.comets) {
        if (!comet.active) continue
        const spd = Math.hypot(comet.vx, comet.vy)
        const tx = comet.x - (comet.vx / spd) * comet.trailLen
        const ty = comet.y - (comet.vy / spd) * comet.trailLen
        const grad = ctx.createLinearGradient(comet.x, comet.y, tx, ty)
        grad.addColorStop(0, COMET_HEAD); grad.addColorStop(0.15, COMET_TRAIL); grad.addColorStop(1, "rgba(69,162,158,0)")
        ctx.strokeStyle = grad; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(comet.x, comet.y); ctx.lineTo(tx, ty); ctx.stroke()
        ctx.fillStyle = COMET_HEAD; ctx.fillRect(Math.round(comet.x) - 1, Math.round(comet.y) - 1, 3, 3)
      }

      // ── Shooting stars (faint, fast, frequent — distinct from the big comets) ─
      state.nextShootMs -= delta
      if (state.nextShootMs <= 0) {
        if (state.shootingStars.length < 3) state.shootingStars.push(spawnShoot(w, h))
        state.nextShootMs = randomBetween(2500, 6000)
      }
      for (let i = state.shootingStars.length - 1; i >= 0; i--) {
        const s = state.shootingStars[i]
        s.x += s.vx * delta; s.y += s.vy * delta; s.life -= delta
        if (s.life <= 0 || s.x < -60 || s.x > w + 60 || s.y > h + 60) { state.shootingStars.splice(i, 1); continue }
        const spd = Math.hypot(s.vx, s.vy)
        const tx = s.x - (s.vx / spd) * s.len, ty = s.y - (s.vy / spd) * s.len
        const a = Math.sin((s.life / s.maxLife) * Math.PI) * 0.55  // fade in then out
        const grad = ctx.createLinearGradient(s.x, s.y, tx, ty)
        grad.addColorStop(0, `rgba(255,255,255,${a})`)
        grad.addColorStop(1, "rgba(255,255,255,0)")
        ctx.strokeStyle = grad; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke()
      }

      // ── Flybys ───────────────────────────────────────────────────────────────
      const shipDefs = shipDefsRef.current
      if (shipDefs) {
        state.nextFlybyMs -= delta
        if (state.nextFlybyMs <= 0) {
          if (state.flybys.filter(f => f.active).length < 2) state.flybys.push(spawnFlyby(w, h, shipDefs))
          state.nextFlybyMs = randomBetween(12000, 28000)
        }
      }
      for (const fb of state.flybys) {
        if (!fb.active) continue
        fb.x += fb.vx * delta; fb.y += fb.vy * delta
        const margin = fb.sprite.width * fb.scale + 60
        if (fb.x < -margin || fb.x > w + margin) fb.active = false
      }
      while (state.flybys.length > 6) state.flybys.shift()

      // Draw flybys (background layer — before planets & trails)
      for (const fb of state.flybys) {
        if (!fb.active) continue
        const sw = fb.sprite.width * fb.scale
        const sh = fb.sprite.height * fb.scale

        ctx.save()
        ctx.globalAlpha = fb.alpha
        ctx.imageSmoothingEnabled = false

        if (fb.flipped) {
          // Traveling left: flip sprite horizontally around its center
          ctx.translate(fb.x + sw / 2, fb.y)
          ctx.scale(-1, 1)
          ctx.drawImage(fb.sprite, -sw / 2, -sh / 2, sw, sh)
          // Engine glow on flipped ship (engine is on original left = now right)
          const [er, eg, eb] = hexToRgb(fb.engineColor)
          ctx.globalAlpha = fb.alpha * 0.8
          ctx.fillStyle = `rgba(${er},${eg},${eb},0.9)`
          ctx.fillRect(Math.round(-sw / 2 + fb.engineX * fb.scale - 2), Math.round(-sh / 2 + fb.engineY * fb.scale - 2), 6, 4)
          ctx.fillStyle = `rgba(${er},${eg},${eb},0.4)`
          ctx.fillRect(Math.round(-sw / 2 + fb.engineX * fb.scale - 4), Math.round(-sh / 2 + fb.engineY * fb.scale - 4), 12, 8)
        } else {
          ctx.drawImage(fb.sprite, Math.round(fb.x - sw / 2), Math.round(fb.y - sh / 2), sw, sh)
          // Engine glow (engine at left end of sprite = back of ship)
          const [er, eg, eb] = hexToRgb(fb.engineColor)
          ctx.globalAlpha = fb.alpha * 0.8
          ctx.fillStyle = `rgba(${er},${eg},${eb},0.9)`
          ctx.fillRect(Math.round(fb.x - sw / 2 + fb.engineX * fb.scale - 2), Math.round(fb.y - sh / 2 + fb.engineY * fb.scale - 2), 6, 4)
          ctx.fillStyle = `rgba(${er},${eg},${eb},0.4)`
          ctx.fillRect(Math.round(fb.x - sw / 2 + fb.engineX * fb.scale - 4), Math.round(fb.y - sh / 2 + fb.engineY * fb.scale - 4), 12, 8)
        }
        ctx.restore()
      }

      // ── Update planets & trailing-edge particles ─────────────────────────────
      for (const planet of state.planets.slice(0, visibleCount)) {
        planet.angle += planet.def.speed * delta
        const rx = planet.def.orbitRX * orbitScale, ry = planet.def.orbitRY * orbitScale
        const px = cx + Math.cos(planet.angle) * rx, py = cy + Math.sin(planet.angle) * ry
        const rendered = planet.def.baseSize * planet.def.scale
        const planetRadius = rendered / 2

        const velX = px - planet.prevX, velY = py - planet.prevY
        const velLen = Math.hypot(velX, velY)

        if (!planet.initialized) {
          planet.prevX = px; planet.prevY = py; planet.initialized = true
        } else if (velLen > 0.001) {
          const vnX = velX / velLen, vnY = velY / velLen
          const perpX = -vnY, perpY = vnX
          const originX = px - vnX * planetRadius * 0.8
          const originY = py - vnY * planetRadius * 0.8
          const pSize = Math.max(3, Math.floor(planetRadius * 0.22))
          const maxTrail = 240, emitInterval = 14

          planet.emitAccum += delta
          while (planet.emitAccum >= emitInterval) {
            planet.emitAccum -= emitInterval
            const spread = randomBetween(-planetRadius * 0.7, planetRadius * 0.7)
            const drift = randomBetween(0, planetRadius * 0.3)
            const spawnX = originX + perpX * spread - vnX * drift + randomBetween(-1.5, 1.5)
            const spawnY = originY + perpY * spread - vnY * drift + randomBetween(-1.5, 1.5)
            const life = randomBetween(900, 2400)
            // Cascade drift: each particle fans outward (perpendicular to
            // motion, sign matched to its spread side) and slightly backward
            // along the motion vector. Magnitudes are tiny (px/ms) so a
            // 2-second-life particle moves ~20-40 logical pixels — enough to
            // read as "dust dissolving away", not as obvious motion.
            const spreadSign = spread === 0 ? (Math.random() < 0.5 ? 1 : -1) : Math.sign(spread)
            const outward = randomBetween(0.008, 0.022)
            const backward = randomBetween(0.004, 0.014)
            const vx = perpX * spreadSign * outward - vnX * backward
            const vy = perpY * spreadSign * outward - vnY * backward
            const baseSize = Math.random() < 0.25 ? Math.max(1, pSize - 1) : pSize  // a few small sparks per emit
            const p: TrailParticle = {
              x: spawnX, y: spawnY, vx, vy,
              life, maxLife: life,
              baseSize, color: planet.def.trailColor,
            }
            if (planet.trail.length < maxTrail) { planet.trail.push(p) }
            else { const old = planet.trail.shift()!; Object.assign(old, p); planet.trail.push(old) }
          }
          planet.prevX = px; planet.prevY = py
        }
        // Drift + decay. Multiplier converts px/ms → px over the frame's delta.
        for (let i = planet.trail.length - 1; i >= 0; i--) {
          const tp = planet.trail[i]
          tp.x += tp.vx * delta
          tp.y += tp.vy * delta
          tp.life -= delta
          if (tp.life <= 0) planet.trail.splice(i, 1)
        }
      }

      const sorted = state.planets.slice(0, visibleCount).sort((a, b) => Math.sin(a.angle) - Math.sin(b.angle))

      // ── Draw trails (cascading dissolve) ─────────────────────────────────────
      // Non-linear curves: alpha holds bright longer then fades fast at end
      // (life^0.5), size shrinks more aggressively (life^0.7) so particles
      // "pixelate down" as they die. Effect reads as cosmic dust dissolving.
      for (const planet of state.planets.slice(0, visibleCount)) {
        const [r, g, b] = hexToRgb(planet.def.trailColor)
        for (const p of planet.trail) {
          const lifeFrac = p.life / p.maxLife
          const alpha = Math.pow(lifeFrac, 0.5) * 0.9
          const size = Math.max(1, Math.round(p.baseSize * Math.pow(lifeFrac, 0.7)))
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
          ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size)
        }
      }

      // ── Draw planets behind logo ─────────────────────────────────────────────
      for (const planet of sorted) {
        if (Math.sin(planet.angle) >= 0) continue
        const rx = planet.def.orbitRX * orbitScale, ry = planet.def.orbitRY * orbitScale
        const px = cx + Math.cos(planet.angle) * rx, py = cy + Math.sin(planet.angle) * ry
        const rendered = planet.def.baseSize * planet.def.scale
        const isGas = planet.def.type === "gas"
        const drawW = isGas ? rendered * 2 : rendered
        const z = Math.sin(planet.angle)
        const depth = 0.38 + 0.62 * ((z + 1) / 2)
        drawPlanetGlow(ctx, px, py, (isGas ? drawW : rendered) / 2, planet.def.secondary, depth)
        ctx.save(); ctx.globalAlpha = depth; ctx.imageSmoothingEnabled = false
        ctx.drawImage(planet.sprite, Math.round(px - drawW / 2), Math.round(py - rendered / 2), drawW, rendered)
        ctx.restore()
      }

      // ── Brand logo: halo + one-shot reveal (spinning-Earth fill untouched) ────
      if (state.logoPixels && state.logoPixels.length > 0 && state.logoPixelSize > 0) {
        const ps = state.logoPixelSize
        const lW = state.logoCols * ps
        const lH = state.logoRows * ps
        const ctr = cy + floatY
        const e = 1 - Math.pow(1 - logoIntro, 3)   // easeOutCubic reveal 0→1

        // Soft teal halo behind the mark, fading in with the reveal.
        const gr = Math.max(lW, lH) * 0.62
        const halo = ctx.createRadialGradient(cx, ctr, 0, cx, ctr, gr)
        halo.addColorStop(0, "rgba(61,207,194,0.18)")
        halo.addColorStop(0.5, "rgba(61,207,194,0.06)")
        halo.addColorStop(1, "rgba(61,207,194,0)")
        ctx.save()
        ctx.globalAlpha = e
        ctx.globalCompositeOperation = "lighter"
        ctx.fillStyle = halo
        ctx.fillRect(cx - gr, ctr - gr, gr * 2, gr * 2)
        ctx.restore()

        // Reveal: fade + slight scale-up around the logo centre.
        ctx.save()
        ctx.globalAlpha = e
        const s = 0.92 + 0.08 * e
        ctx.translate(cx, ctr); ctx.scale(s, s); ctx.translate(-cx, -ctr)

        const offX = cx - lW / 2
        const offY = ctr - lH / 2
        ctx.beginPath()
        for (const { lx, ly } of state.logoPixels)
          ctx.rect(Math.round(offX + lx * ps), Math.round(offY + ly * ps), ps, ps)
        ctx.clip()

        if (state.earthImg?.complete && state.earthFrames > 0) {
          const frameSize = state.earthImg.naturalHeight  // each frame is square
          const frame = Math.floor(elapsed / EARTH_FRAME_MS) % state.earthFrames
          const tileH = lH
          const tileW = tileH  // frames are square
          ctx.imageSmoothingEnabled = true
          for (let tx = offX; tx < offX + lW; tx += tileW)
            ctx.drawImage(state.earthImg, frame * frameSize, 0, frameSize, frameSize, tx, offY, tileW, tileH)
        } else {
          ctx.fillStyle = "#FFFFFF"
          for (const { lx, ly } of state.logoPixels)
            ctx.fillRect(Math.round(offX + lx * ps), Math.round(offY + ly * ps), ps, ps)
        }

        ctx.restore()
      } else if (state.logoImg?.complete && state.logoW > 0) {
        ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.imageSmoothingEnabled = false
        ctx.drawImage(state.logoImg, Math.round(cx - state.logoW / 2), Math.round(cy + floatY - state.logoH / 2), state.logoW, state.logoH)
        ctx.restore()
      }

      // ── Draw planets in front of logo ────────────────────────────────────────
      for (const planet of sorted) {
        if (Math.sin(planet.angle) < 0) continue
        const rx = planet.def.orbitRX * orbitScale, ry = planet.def.orbitRY * orbitScale
        const px = cx + Math.cos(planet.angle) * rx, py = cy + Math.sin(planet.angle) * ry
        const rendered = planet.def.baseSize * planet.def.scale
        const isGas = planet.def.type === "gas"
        const drawW = isGas ? rendered * 2 : rendered
        drawPlanetGlow(ctx, px, py, (isGas ? drawW : rendered) / 2, planet.def.secondary, 1)
        ctx.save(); ctx.imageSmoothingEnabled = false
        ctx.drawImage(planet.sprite, Math.round(px - drawW / 2), Math.round(py - rendered / 2), drawW, rendered)
        ctx.restore()
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [initScene])

  useEffect(() => {
    const starsCanvas = starsCanvasRef.current
    const sceneCanvas = sceneCanvasRef.current
    if (!starsCanvas || !sceneCanvas) return

    // Build ship sprites once (canvas API, must be in browser)
    shipDefsRef.current = buildShipDefs()

    stateRef.current = initScene()

    // Respect prefers-reduced-motion. Paint a single static parallax-starfield
    // frame so the hero isn't a flat black panel, then bail before scheduling
    // the rAF tick. Saves battery on phone + accessibility win.
    let reducedMotion = false
    try {
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    } catch {
      reducedMotion = false
    }
    if (reducedMotion) {
      const dpr = window.devicePixelRatio || 1
      const w = starsCanvas.parentElement?.clientWidth ?? window.innerWidth
      const h = starsCanvas.parentElement?.clientHeight ?? window.innerHeight
      setupStarsCanvasSize(starsCanvas, w, h, dpr)
      const built = buildStarfield(w, h, dpr)
      paintStarsFrame(starsCanvas, w, h, dpr, built.layers, built.twinklers, 0)
      return
    }

    const observer = new IntersectionObserver(([entry]) => { pausedRef.current = !entry.isIntersecting }, { threshold: 0 })
    observer.observe(starsCanvas)

    // Mouse / device-tilt parallax. Interaction-driven (not scroll). iOS without
    // motion permission simply never fires the tilt event → graceful no-op.
    const onMouse = (e: MouseEvent) => {
      pointerTargetRef.current.x = (e.clientX / window.innerWidth - 0.5) * 2
      pointerTargetRef.current.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      pointerTargetRef.current.x = Math.max(-1, Math.min(1, e.gamma / 30))
      pointerTargetRef.current.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30))
    }
    window.addEventListener("mousemove", onMouse, { passive: true })
    window.addEventListener("deviceorientation", onTilt, { passive: true })

    // Defer the animation loop until the browser is idle so the rAF
    // pixel churn doesn't fight the initial paint / hydration / Lighthouse
    // Speed Index measurement. initScene() above has already painted a
    // static first frame so the hero is visible immediately.
    let idleHandle: number | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    type Ric = (cb: () => void, opts?: { timeout?: number }) => number
    const ric = (window as unknown as { requestIdleCallback?: Ric }).requestIdleCallback
    if (typeof ric === "function") {
      idleHandle = ric(() => { runLoop() }, { timeout: 2000 })
    } else {
      timeoutHandle = setTimeout(() => { runLoop() }, 1500)
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      observer.disconnect()
      window.removeEventListener("mousemove", onMouse)
      window.removeEventListener("deviceorientation", onTilt)
      if (idleHandle !== null) {
        const cancelRic = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback
        if (typeof cancelRic === "function") cancelRic(idleHandle)
      }
      if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    }
  }, [initScene, runLoop])

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%", minHeight: "600px", overflow: "hidden", background: BG, ...style }}>
      <canvas ref={starsCanvasRef} style={{ position: "absolute", inset: 0, display: "block" }} />
      <canvas ref={sceneCanvasRef} style={{ position: "absolute", inset: 0, display: "block" }} />
      {/* Vignette: subtle corner darkening to frame the centre + add cinematic depth */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse at 50% 44%, transparent 50%, rgba(4,5,12,0.55) 100%)",
        }}
      />
    </div>
  )
}
