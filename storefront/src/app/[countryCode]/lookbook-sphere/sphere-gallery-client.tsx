"use client"

/**
 * Spherical lookbook gallery — phantom.land-style.
 *
 * You stand at the centre of a sphere whose inner surface is tiled with
 * project cards. Drag (or scroll) to look around with inertia + lenis-style
 * easing; hover inverts a card; click zooms the camera into the card and
 * slides a detail page over the top.
 *
 * Everything WebGL lives in one big useEffect: tile textures are drawn on
 * offscreen canvases (so text labels live *inside* the 3D card), geometry is
 * a true spherical patch per row (the grid curves exactly like the inside of
 * a sphere), and GSAP drives the intro, zoom and overlay transitions.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import * as THREE from "three"
import gsap from "gsap"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { sampleWordmarkStipple } from "@modules/home/components/home-particle-three/sample-wordmark"

/** The fully interactive lab build (cursor carry + comet wake) — only
 * loaded when a pole is clicked, so browsing the sphere doesn't pay for
 * react-three-fiber. */
const HomeParticleThree = dynamic(
  () => import("@modules/home/components/home-particle-three"),
  { ssr: false }
)
import {
  SPHERE_ROW_PHIS_DEG,
  sphereColsForPhiDeg,
  type SphereProject,
} from "./projects"

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const SPHERE_RADIUS = 30
const PHI_STEP = THREE.MathUtils.degToRad(19)
// Rings from pole-ish to pole-ish (constants shared with page.tsx via
// projects.ts). Each ring gets its own column count scaled by cos(phi) so
// tiles stay evenly sized while the rings visibly converge — the staggered
// seams + shrinking rings are what make it read as a SPHERE instead of a
// column of aligned tiles.
const ROW_PHIS_DEG = SPHERE_ROW_PHIS_DEG
const colsForPhi = (phiRad: number) =>
  sphereColsForPhiDeg((phiRad * 180) / Math.PI)
const TILE_FILL_THETA = 0.945 // gutter between columns (fraction of the step)
const TILE_PHI = PHI_STEP * 0.93 // gutter between rows
const BASE_FOV = 65
const DETAIL_FOV = 40
const DETAIL_DOLLY = 0.42 // fraction of radius the camera travels toward a card
// Pole stop: free trackball spin was tried (d7bb3833) and reverted — flipping
// over the poles re-orients the photos too much. Pitch is clamped instead.
const PITCH_LIMIT = THREE.MathUtils.degToRad(75)
const SMOOTHING = 7.5 // larger = snappier follow of the drag target
const INERTIA_DECAY = 2.2 // larger = momentum dies faster
const CLICK_DIST_PX = 7 // drag distance below which pointerup counts as a click

// Wordmark planes floating over the two pole caps (the rings stop at ±76°,
// leaving a dark hole). Yaw-billboarded each frame so the mark reads upright
// from any spin direction; pitch never flips past the poles so no other
// correction is needed.
// Pole wordmarks — the particle build from /particle-threejs, embedded in the
// sphere scene. The wordmark alpha is stippled into a point cloud
// (sampleWordmarkStipple) and rendered as shader-animated grains painted with
// a per-pole gradient (north solar, south aurora — see POLE_GRADIENT_*); a
// soft black disc behind each mark masks the card header text that crowds the
// north cap rim (cards point their tops at the north pole, so without the
// disc the titles bleed through the letter gaps).
const POLE_LOGO_SRC = "/branding/sc-prints-logo-white-transparent.png"
// Sized to the cap hole (the rings leave a ~10° opening) so the mark brands
// the empty pole without blotting out the surrounding cards, and parked just
// inside the shell so it doesn't parallax away from the hole at the pitch stop.
const POLE_LOGO_WIDTH = 5
const POLE_LOGO_Y = SPHERE_RADIUS * 0.975
// Stipple density: render size fed to the sampler (smaller = coarser grid)
// and the cap on grains actually rendered per pole.
const POLE_STIPPLE_RENDER_SIZE = 320
const POLE_PARTICLE_COUNT = 7000
const POLE_POINT_SIZE = 0.3
// Backing disc: plane size + radial fade drawn into its texture.
const POLE_DISC_SIZE = 9
// Invisible click target over each pole mark (world units).
const POLE_HIT_RADIUS = 3.4

// Each pole gets its own palette — the wordmark stipple on the cap AND the
// particle playground it opens into share the pole's gradient, so the colour
// language carries through the click. North runs hot (solar ramp anchored on
// the brand pink); south runs cold (aurora australis — fitting, since that's
// the southern lights).
const POLE_GRADIENT_NORTH: [number, number, number][] = [
  [201, 24, 74],
  [255, 46, 99],
  [255, 122, 48],
  [255, 183, 60],
  [255, 226, 140],
]
const POLE_GRADIENT_SOUTH: [number, number, number][] = [
  [16, 185, 129],
  [45, 212, 191],
  [34, 211, 238],
  [56, 130, 246],
  [129, 90, 230],
  [192, 110, 255],
]

const POLE_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute vec3 aSeed;
  uniform float uTime;
  uniform float uPointSize;
  uniform float uPixelRatio;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec3 p = position;
    // Ambient shimmer — each grain wanders gently around its home position.
    float amp = 0.018 + aSeed.z * 0.05;
    p.x += sin(uTime * (0.6 + aSeed.y * 0.9) + aSeed.x * 6.2831) * amp;
    p.y += cos(uTime * (0.5 + aSeed.x * 0.8) + aSeed.y * 6.2831) * amp;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float twinkle = 0.78 + 0.22 * sin(uTime * (1.0 + aSeed.z * 2.0) + aSeed.x * 12.566);
    gl_PointSize = uPointSize * uPixelRatio * twinkle * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const POLE_FRAGMENT_SHADER = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.2, d) * uOpacity;
    gl_FragColor = vec4(vColor, a);
  }
`

// Card texture LAYOUT space (≈0.94 aspect like the reference tiles). The
// actual canvas is allocated at TEX_SCALE of this — with 122 tiles on the
// ball each card renders small enough on screen that 0.75 is visually
// lossless, and it keeps total GPU texture memory below the old 78-tile
// build despite ~56% more cards.
const TEX_W = 720
const TEX_H = 768
const TEX_SCALE = 0.75
const MONO_STACK =
  '"SF Mono", "Menlo", "Roboto Mono", "Liberation Mono", monospace'

/**
 * Remote lookbook photos live on R2 (pub-*.r2.dev), which sends no CORS
 * headers — drawing them straight into the texture canvas would taint it and
 * the WebGL upload would throw. Route them through the same-origin
 * /_next/image optimizer instead: no taint, downscaled WebP (the originals
 * are multi-MB), and 60-day edge cache. Local /public assets load directly.
 */
const optimizedSrc = (src: string, width: 828 | 1080) =>
  src.startsWith("/")
    ? src
    : `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`

// ---------------------------------------------------------------------------
// Card texture drawing (normal + hover/inverted states)
// ---------------------------------------------------------------------------

type CardPalette = {
  bg: string
  brand: string
  title: string
  meta: string
  pillBg: string
  pillText: string
  year: string
  imgPlaceholder: string
}

const PALETTE_NORMAL: CardPalette = {
  bg: "#0b0b0b",
  brand: "#f1f1f1",
  title: "#8d8d8d",
  meta: "#e4e4e4",
  pillBg: "#262626",
  pillText: "#c2c2c2",
  year: "#7e7e7e",
  imgPlaceholder: "#141414",
}

const PALETTE_HOVER: CardPalette = {
  bg: "#c9c9c5",
  brand: "#111111",
  title: "#4d4d4a",
  meta: "#1d1d1b",
  pillBg: "rgba(0,0,0,0.16)",
  pillText: "#22221f",
  year: "#5a5a56",
  imgPlaceholder: "#b5b5b1",
}

function drawCard(
  canvas: HTMLCanvasElement,
  project: SphereProject,
  img: HTMLImageElement | null,
  palette: CardPalette
) {
  canvas.width = Math.round(TEX_W * TEX_SCALE)
  canvas.height = Math.round(TEX_H * TEX_SCALE)
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  // Draw in the full 720×768 layout space regardless of allocation size.
  ctx.scale(TEX_SCALE, TEX_SCALE)

  ctx.fillStyle = palette.bg
  ctx.fillRect(0, 0, TEX_W, TEX_H)

  const pad = 34

  // --- header: brand left, project title right -----------------------------
  // maxWidth args keep arbitrary admin-entered titles from colliding.
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = palette.brand
  ctx.font = `500 28px ${MONO_STACK}`
  ctx.textAlign = "left"
  ctx.fillText(project.brand, pad, 62, TEX_W * 0.52)

  ctx.fillStyle = palette.title
  ctx.font = `400 17px ${MONO_STACK}`
  ctx.textAlign = "right"
  try {
    // letterSpacing is widely supported in Chromium; harmless if missing
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      "2px"
  } catch {}
  ctx.fillText(project.title, TEX_W - pad, 60, TEX_W * 0.38)
  try {
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      "0px"
  } catch {}

  // --- centre image (cover-fit into an inset frame) -------------------------
  const frame = {
    x: 86,
    y: 122,
    w: TEX_W - 86 * 2,
    h: TEX_H - 122 - 152,
  }
  if (img && img.naturalWidth > 0) {
    const scale = Math.max(frame.w / img.naturalWidth, frame.h / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    ctx.save()
    ctx.beginPath()
    ctx.rect(frame.x, frame.y, frame.w, frame.h)
    ctx.clip()
    ctx.drawImage(img, frame.x + (frame.w - dw) / 2, frame.y + (frame.h - dh) / 2, dw, dh)
    ctx.restore()
  } else {
    ctx.fillStyle = palette.imgPlaceholder
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h)
  }

  // --- footer: category + tag pills left, year right ------------------------
  // Real lookbook entries may carry no tags/year — skip empties gracefully.
  const footerBaseline = TEX_H - 56
  ctx.textAlign = "left"
  let cursorX = pad
  if (project.category) {
    ctx.font = `400 19px ${MONO_STACK}`
    ctx.fillStyle = palette.meta
    const category = project.category.toUpperCase()
    ctx.fillText(category, pad, footerBaseline)
    cursorX += ctx.measureText(category).width + 18
  }

  const pillH = 40
  const pillR = 20
  const pillPadX = 16
  const pillTextSize = 17
  for (const tag of project.tags) {
    ctx.font = `400 ${pillTextSize}px ${MONO_STACK}`
    const label = tag.toUpperCase()
    const tw = ctx.measureText(label).width
    const pw = tw + pillPadX * 2
    if (cursorX + pw > TEX_W - pad - 80) break // keep clear of the year
    const py = footerBaseline - 27
    ctx.fillStyle = palette.pillBg
    ctx.beginPath()
    ctx.roundRect(cursorX, py, pw, pillH, pillR)
    ctx.fill()
    ctx.fillStyle = palette.pillText
    ctx.fillText(label, cursorX + pillPadX, footerBaseline - 1)
    cursorX += pw + 10
  }

  if (project.year) {
    ctx.font = `400 19px ${MONO_STACK}`
    ctx.fillStyle = palette.year
    ctx.textAlign = "right"
    ctx.fillText(project.year, TEX_W - pad, footerBaseline)
  }
}

// ---------------------------------------------------------------------------
// Spherical tile geometry — a true patch of the sphere's inner surface
// ---------------------------------------------------------------------------

function buildSphericalTile(
  radius: number,
  thetaSpan: number,
  phiCenter: number,
  phiSpan: number,
  segs = 10
): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let iy = 0; iy <= segs; iy++) {
    const v = iy / segs
    const phi = phiCenter + (v - 0.5) * phiSpan
    for (let ix = 0; ix <= segs; ix++) {
      const u = ix / segs
      const theta = (u - 0.5) * thetaSpan
      const cosP = Math.cos(phi)
      positions.push(
        radius * cosP * Math.sin(theta),
        radius * Math.sin(phi),
        -radius * cosP * Math.cos(theta)
      )
      uvs.push(u, v)
    }
  }
  for (let iy = 0; iy < segs; iy++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iy * (segs + 1) + ix
      const b = a + 1
      const c = a + (segs + 1)
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

const shortestAngle = (a: number) => {
  const tau = Math.PI * 2
  let r = a % tau
  if (r > Math.PI) r -= tau
  if (r < -Math.PI) r += tau
  return r
}

// ---------------------------------------------------------------------------
// Small chrome pieces (clock, icons)
// ---------------------------------------------------------------------------

function StudioClock() {
  const [time, setTime] = useState<string>("")
  useEffect(() => {
    const fmt = () =>
      new Intl.DateTimeFormat("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Australia/Sydney",
      }).format(new Date())
    setTime(fmt())
    const id = setInterval(() => setTime(fmt()), 10_000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/80">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/90" />
      <span>NSW, Australia</span>
      <span className="text-white/50">{time} GMT+10</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SphereGalleryClient({
  projects,
}: {
  projects: SphereProject[]
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const overlayContentRef = useRef<HTMLDivElement>(null)
  const particleOverlayRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<SphereProject | null>(null)
  const [particlePlayOpen, setParticlePlayOpen] = useState(false)
  /** Which pole the playground was opened from — picks its gradient. */
  const [activePoleSign, setActivePoleSign] = useState<1 | -1>(1)
  const [introDone, setIntroDone] = useState(false)

  // Imperative bridge between React click-handlers and the WebGL effect.
  const apiRef = useRef<{
    openByMesh: (mesh: THREE.Mesh) => void
    close: () => void
    closePole: () => void
  } | null>(null)
  const detailOpenRef = useRef(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    // --- renderer / scene / camera ------------------------------------------
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setClearColor(0x000000, 1)
    mount.appendChild(renderer.domElement)
    const canvas = renderer.domElement
    canvas.style.touchAction = "none"
    canvas.style.cursor = "grab"
    canvas.style.display = "block"

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      BASE_FOV,
      mount.clientWidth / mount.clientHeight,
      0.1,
      SPHERE_RADIUS * 4
    )
    camera.rotation.order = "YXZ"

    // --- card textures (shared per project, normal + hover states) -----------
    type CardTex = {
      normal: THREE.CanvasTexture
      hover: THREE.CanvasTexture
      normalCanvas: HTMLCanvasElement
      hoverCanvas: HTMLCanvasElement
    }
    const cardTextures: CardTex[] = projects.map((project) => {
      const normalCanvas = document.createElement("canvas")
      const hoverCanvas = document.createElement("canvas")
      drawCard(normalCanvas, project, null, PALETTE_NORMAL)
      drawCard(hoverCanvas, project, null, PALETTE_HOVER)
      const mk = (c: HTMLCanvasElement) => {
        const t = new THREE.CanvasTexture(c)
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        t.minFilter = THREE.LinearMipmapLinearFilter
        return t
      }
      return {
        normal: mk(normalCanvas),
        hover: mk(hoverCanvas),
        normalCanvas,
        hoverCanvas,
      }
    })

    // Stream project photos in and re-draw both card states as they arrive.
    const loadedImages: HTMLImageElement[] = []
    projects.forEach((project, i) => {
      const img = new Image()
      img.decoding = "async"
      img.onload = () => {
        const tex = cardTextures[i]
        drawCard(tex.normalCanvas, project, img, PALETTE_NORMAL)
        drawCard(tex.hoverCanvas, project, img, PALETTE_HOVER)
        tex.normal.needsUpdate = true
        tex.hover.needsUpdate = true
      }
      img.src = optimizedSrc(project.image, 828)
      loadedImages.push(img)
    })

    // --- tile meshes ----------------------------------------------------------
    const rowGeometries: THREE.BufferGeometry[] = []
    const tileMeshes: THREE.Mesh[] = []
    const tileMaterials: THREE.MeshBasicMaterial[] = []
    // Sequential assignment — every tile gets a distinct project as long as
    // the pool is at least tile-count deep. (The old `row * 5 + col` formula
    // collided across rows, repeating the same photo on multiple tiles.)
    let tileIndex = 0

    ROW_PHIS_DEG.forEach((phiDeg, row) => {
      const phiCenter = THREE.MathUtils.degToRad(phiDeg)
      const cols = colsForPhi(phiCenter)
      const thetaStep = (Math.PI * 2) / cols
      const geo = buildSphericalTile(
        SPHERE_RADIUS,
        thetaStep * TILE_FILL_THETA,
        phiCenter,
        TILE_PHI
      )
      rowGeometries.push(geo)
      // Half-step phase shift on alternate rows so seams brick-stagger even
      // where neighbouring rings share a column count.
      const phase = (row % 2) * (thetaStep / 2)
      for (let col = 0; col < cols; col++) {
        const projectIdx = tileIndex++ % projects.length
        const mat = new THREE.MeshBasicMaterial({
          map: cardTextures[projectIdx].normal,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
        })
        const mesh = new THREE.Mesh(geo, mat)
        const thetaCenter = col * thetaStep + phase
        mesh.rotation.y = thetaCenter
        mesh.userData = {
          projectIdx,
          thetaCenter,
          phiCenter,
        }
        scene.add(mesh)
        tileMeshes.push(mesh)
        tileMaterials.push(mat)
      }
    })

    // --- pole particle wordmarks ------------------------------------------------
    // One group per pole (backing disc + point cloud), slightly inside the
    // sphere so it composites over the cap hole. Not in tileMeshes, so
    // hover/click raycasts ignore them. Tiles keep their pivot at the sphere
    // origin, so the transparent sort draws them AFTER anything with real
    // distance — renderOrder lifts the disc (1) and grains (2) above them;
    // legitimate, since along any sight-line the pole plane is hit before
    // the shell.
    const poleGroups: THREE.Group[] = []
    // Invisible circles over the marks — raycast targets for click + hover.
    const poleHitMeshes: THREE.Mesh[] = []
    let polePointsMat: THREE.ShaderMaterial | null = null
    const poleDispose: (() => void)[] = []
    let poleCancelled = false
    sampleWordmarkStipple(POLE_LOGO_SRC, POLE_STIPPLE_RENDER_SIZE)
      .then(({ points, width, height }) => {
        if (poleCancelled) return

        // Shuffle so a capped count still samples the whole mark evenly.
        const indices = new Uint32Array(points.length)
        for (let i = 0; i < points.length; i++) indices[i] = i
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          const t = indices[i]!
          indices[i] = indices[j]!
          indices[j] = t
        }
        const count = Math.min(POLE_PARTICLE_COUNT, points.length)
        const scale = POLE_LOGO_WIDTH / width
        const positions = new Float32Array(count * 3)
        const seeds = new Float32Array(count * 3)
        /** Gradient coordinate (0..1 across the mark) per sampled grain —
         * kept so each pole can paint the same stipple with its own
         * palette without re-walking the sample set. */
        const us = new Float32Array(count)
        for (let i = 0; i < count; i++) {
          const sp = points[indices[i]!]!
          const i3 = i * 3
          positions[i3] = (sp.x - width / 2) * scale
          positions[i3 + 1] = (height / 2 - sp.y) * scale
          positions[i3 + 2] = 0
          us[i] = sp.u
          seeds[i3] = Math.random()
          seeds[i3 + 1] = Math.random()
          seeds[i3 + 2] = Math.random()
        }

        const buildColors = (stops: [number, number, number][]) => {
          const colors = new Float32Array(count * 3)
          const segCount = stops.length - 1
          for (let i = 0; i < count; i++) {
            const i3 = i * 3
            const segPos = Math.min(us[i]!, 0.9999) * segCount
            const segIdx = Math.floor(segPos)
            const localT = segPos - segIdx
            const c1 = stops[segIdx]!
            const c2 = stops[segIdx + 1]!
            colors[i3] = (c1[0] + (c2[0] - c1[0]) * localT) / 255
            colors[i3 + 1] = (c1[1] + (c2[1] - c1[1]) * localT) / 255
            colors[i3 + 2] = (c1[2] + (c2[2] - c1[2]) * localT) / 255
          }
          return colors
        }

        /** One geometry per pole — positions/seeds share the same backing
         * arrays (static, never mutated), only the colour attribute
         * differs between north and south. */
        const makePoleGeo = (stops: [number, number, number][]) => {
          const geo = new THREE.BufferGeometry()
          geo.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3)
          )
          geo.setAttribute(
            "aColor",
            new THREE.BufferAttribute(buildColors(stops), 3)
          )
          geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3))
          return geo
        }
        const poleGeoBySign = new Map<number, THREE.BufferGeometry>([
          [1, makePoleGeo(POLE_GRADIENT_NORTH)],
          [-1, makePoleGeo(POLE_GRADIENT_SOUTH)],
        ])

        const pointsMat = new THREE.ShaderMaterial({
          vertexShader: POLE_VERTEX_SHADER,
          fragmentShader: POLE_FRAGMENT_SHADER,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: {
            uTime: { value: 0 },
            uPointSize: { value: POLE_POINT_SIZE },
            uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
            uOpacity: { value: 0 },
          },
        })
        polePointsMat = pointsMat

        // Soft black backdrop — radial fade so it reads as a vignette
        // around the mark, not a hard sticker over the cards.
        const discCanvas = document.createElement("canvas")
        discCanvas.width = discCanvas.height = 256
        const dctx = discCanvas.getContext("2d")
        if (dctx) {
          const grad = dctx.createRadialGradient(128, 128, 0, 128, 128, 128)
          grad.addColorStop(0, "rgba(0,0,0,0.95)")
          grad.addColorStop(0.55, "rgba(0,0,0,0.88)")
          grad.addColorStop(1, "rgba(0,0,0,0)")
          dctx.fillStyle = grad
          dctx.fillRect(0, 0, 256, 256)
        }
        const discTex = new THREE.CanvasTexture(discCanvas)
        const discMat = new THREE.MeshBasicMaterial({
          map: discTex,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        })
        const discGeo = new THREE.PlaneGeometry(POLE_DISC_SIZE, POLE_DISC_SIZE)

        // Click target: opacity-0 (NOT visible:false — that would also hide
        // it from the raycaster's perspective in render, while opacity 0
        // keeps raycasting reliable across three versions).
        const hitGeo = new THREE.CircleGeometry(POLE_HIT_RADIUS, 24)
        const hitMat = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        })

        for (const sign of [1, -1]) {
          const group = new THREE.Group()
          group.position.set(0, sign * POLE_LOGO_Y, 0)
          // YXZ: face the pole plane toward the centre first (±90° about X),
          // then the per-frame yaw billboard spins it about the world Y axis.
          group.rotation.order = "YXZ"
          group.rotation.x = sign * (Math.PI / 2)
          const disc = new THREE.Mesh(discGeo, discMat)
          disc.renderOrder = 1
          const grains = new THREE.Points(poleGeoBySign.get(sign)!, pointsMat)
          grains.renderOrder = 2
          const hit = new THREE.Mesh(hitGeo, hitMat)
          hit.userData.poleSign = sign
          group.add(disc)
          group.add(grains)
          group.add(hit)
          scene.add(group)
          poleGroups.push(group)
          poleHitMeshes.push(hit)
        }

        gsap.to(discMat, {
          opacity: 1,
          duration: 1.1,
          delay: 0.35,
          ease: "power2.out",
        })
        gsap.to(pointsMat.uniforms.uOpacity!, {
          value: 1,
          duration: 1.1,
          delay: 0.45,
          ease: "power2.out",
        })

        poleDispose.push(() => {
          gsap.killTweensOf(discMat)
          gsap.killTweensOf(pointsMat.uniforms.uOpacity!)
          poleGeoBySign.forEach((geo) => geo.dispose())
          pointsMat.dispose()
          discGeo.dispose()
          discMat.dispose()
          discTex.dispose()
          hitGeo.dispose()
          hitMat.dispose()
        })
      })
      .catch(() => {
        // Decorative — a failed stipple just means bare poles.
      })

    // --- control state ---------------------------------------------------------
    const ctrl = {
      yaw: 0,
      pitch: 0,
      targetYaw: 0,
      targetPitch: 0,
      velYaw: 0,
      velPitch: 0,
    }
    const zoom = { fov: BASE_FOV, dolly: 0 }
    const detailDir = new THREE.Vector3(0, 0, -1)

    const drag = {
      active: false,
      pointerId: -1,
      lastX: 0,
      lastY: 0,
      total: 0,
      samples: [] as { t: number; x: number; y: number }[],
    }
    const pointerNdc = new THREE.Vector2(10, 10) // offscreen until first move
    const raycaster = new THREE.Raycaster()

    let hovered: THREE.Mesh | null = null
    const setHovered = (mesh: THREE.Mesh | null) => {
      if (hovered === mesh) return
      if (hovered) {
        const m = hovered.material as THREE.MeshBasicMaterial
        m.map = cardTextures[hovered.userData.projectIdx as number].normal
      }
      hovered = mesh
      if (hovered) {
        const m = hovered.material as THREE.MeshBasicMaterial
        m.map = cardTextures[hovered.userData.projectIdx as number].hover
      }
      if (!drag.active) {
        canvas.style.cursor = hovered ? "pointer" : "grab"
      }
    }

    const rotSpeed = () =>
      (camera.fov * (Math.PI / 180)) / Math.max(canvas.clientHeight, 1)

    const clampPitch = (p: number) =>
      Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p))

    // --- pointer handlers --------------------------------------------------------
    const onPointerDown = (e: PointerEvent) => {
      if (detailOpenRef.current) return
      drag.active = true
      drag.pointerId = e.pointerId
      drag.lastX = e.clientX
      drag.lastY = e.clientY
      drag.total = 0
      drag.samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }]
      ctrl.velYaw = 0
      ctrl.velPitch = 0
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
      canvas.style.cursor = "grabbing"
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointerNdc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      if (!drag.active || e.pointerId !== drag.pointerId) return
      const dx = e.clientX - drag.lastX
      const dy = e.clientY - drag.lastY
      drag.lastX = e.clientX
      drag.lastY = e.clientY
      drag.total += Math.abs(dx) + Math.abs(dy)
      const k = rotSpeed()
      ctrl.targetYaw += dx * k
      ctrl.targetPitch = clampPitch(ctrl.targetPitch + dy * k)
      const now = performance.now()
      drag.samples.push({ t: now, x: e.clientX, y: e.clientY })
      while (drag.samples.length > 2 && now - drag.samples[0].t > 110) {
        drag.samples.shift()
      }
    }

    const endDrag = (e: PointerEvent) => {
      if (!drag.active || e.pointerId !== drag.pointerId) return
      drag.active = false
      canvas.style.cursor = hovered ? "pointer" : "grab"
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}

      if (drag.total < CLICK_DIST_PX && !detailOpenRef.current) {
        // Click, not drag → open whatever is under the pointer. The pole
        // wordmarks render above the tiles in the cap zone, so they win.
        raycaster.setFromCamera(pointerNdc, camera)
        const poleHits = raycaster.intersectObjects(poleHitMeshes, false)
        if (poleHits.length > 0) {
          openPole((poleHits[0]!.object.userData.poleSign as number) ?? 1)
          return
        }
        const hits = raycaster.intersectObjects(tileMeshes, false)
        if (hits.length > 0) {
          openDetail(hits[0].object as THREE.Mesh)
        }
        return
      }

      // Fling: derive velocity from the recent pointer samples.
      if (drag.samples.length >= 2) {
        const first = drag.samples[0]
        const last = drag.samples[drag.samples.length - 1]
        const dt = (last.t - first.t) / 1000
        if (dt > 0.016) {
          const k = rotSpeed()
          ctrl.velYaw = ((last.x - first.x) * k) / dt
          ctrl.velPitch = ((last.y - first.y) * k) / dt
        }
      }
    }

    const onWheel = (e: WheelEvent) => {
      if (detailOpenRef.current) return
      e.preventDefault()
      const k = rotSpeed() * 1.1
      ctrl.targetYaw -= e.deltaX * k
      ctrl.targetPitch = clampPitch(ctrl.targetPitch - e.deltaY * k)
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", endDrag)
    canvas.addEventListener("pointercancel", endDrag)
    canvas.addEventListener("wheel", onWheel, { passive: false })

    // --- detail open / close ------------------------------------------------------
    const applyZoom = () => {
      camera.fov = zoom.fov
      camera.updateProjectionMatrix()
      camera.position
        .copy(detailDir)
        .multiplyScalar(SPHERE_RADIUS * DETAIL_DOLLY * zoom.dolly)
    }

    const openDetail = (mesh: THREE.Mesh) => {
      if (detailOpenRef.current) return
      detailOpenRef.current = true
      setHovered(null)
      canvas.style.cursor = "default"
      ctrl.velYaw = 0
      ctrl.velPitch = 0

      const thetaC = mesh.userData.thetaCenter as number
      const phiC = mesh.userData.phiCenter as number
      detailDir.set(
        Math.cos(phiC) * Math.sin(thetaC),
        Math.sin(phiC),
        -Math.cos(phiC) * Math.cos(thetaC)
      )
      // Centre the card: shortest-path yaw to -thetaC, pitch to phiC.
      ctrl.targetYaw = ctrl.yaw + shortestAngle(-thetaC - ctrl.yaw)
      ctrl.targetPitch = phiC

      gsap.to(zoom, {
        fov: DETAIL_FOV,
        dolly: 1,
        duration: 1.05,
        ease: "power3.inOut",
        onUpdate: applyZoom,
      })

      const projectIdx = mesh.userData.projectIdx as number
      setSelected(projects[projectIdx])
    }

    const closeDetail = () => {
      gsap.to(zoom, {
        fov: BASE_FOV,
        dolly: 0,
        duration: 0.95,
        ease: "power3.inOut",
        onUpdate: applyZoom,
        onComplete: () => {
          detailOpenRef.current = false
          canvas.style.cursor = "grab"
        },
      })
    }

    // --- pole playground open / close ------------------------------------------
    // Same camera language as a card click: fly straight at the pole while
    // the FOV tightens, then the React overlay slides over the top.
    const openPole = (sign: number) => {
      if (detailOpenRef.current) return
      detailOpenRef.current = true
      setHovered(null)
      canvas.style.cursor = "default"
      ctrl.velYaw = 0
      ctrl.velPitch = 0

      detailDir.set(0, sign, 0)
      // Look straight at the pole — past the browse clamp on purpose; the
      // close path eases the pitch back inside the stop.
      ctrl.targetPitch = sign * (Math.PI / 2)

      gsap.to(zoom, {
        fov: DETAIL_FOV,
        dolly: 1,
        duration: 1.0,
        ease: "power3.inOut",
        onUpdate: applyZoom,
      })

      setActivePoleSign(sign > 0 ? 1 : -1)
      setParticlePlayOpen(true)
    }

    const closePole = () => {
      gsap.to(zoom, {
        fov: BASE_FOV,
        dolly: 0,
        duration: 0.95,
        ease: "power3.inOut",
        onUpdate: applyZoom,
        onComplete: () => {
          detailOpenRef.current = false
          canvas.style.cursor = "grab"
          // The pole sits beyond the pitch stop — ease back inside it.
          ctrl.targetPitch = clampPitch(ctrl.pitch)
        },
      })
    }

    apiRef.current = { openByMesh: openDetail, close: closeDetail, closePole }

    // --- intro ---------------------------------------------------------------------
    const introZoom = { fov: 92 }
    gsap.to(introZoom, {
      fov: BASE_FOV,
      duration: 1.9,
      ease: "expo.out",
      onUpdate: () => {
        if (!detailOpenRef.current) {
          zoom.fov = introZoom.fov
          camera.fov = introZoom.fov
          camera.updateProjectionMatrix()
        }
      },
    })
    tileMaterials.forEach((mat) => {
      gsap.to(mat, {
        opacity: 1,
        duration: 0.7,
        delay: 0.1 + Math.random() * 0.8,
        ease: "power2.out",
      })
    })
    const introFlag = gsap.delayedCall(0.9, () => setIntroDone(true))

    // --- frame loop -------------------------------------------------------------------
    let lastT = performance.now()
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const dt = Math.min((now - lastT) / 1000, 0.05)
      lastT = now

      // Momentum after release
      if (!drag.active && !detailOpenRef.current) {
        if (Math.abs(ctrl.velYaw) > 0.0001 || Math.abs(ctrl.velPitch) > 0.0001) {
          ctrl.targetYaw += ctrl.velYaw * dt
          ctrl.targetPitch = clampPitch(ctrl.targetPitch + ctrl.velPitch * dt)
          const decay = Math.exp(-dt * INERTIA_DECAY)
          ctrl.velYaw *= decay
          ctrl.velPitch *= decay
        }
      }

      // Lenis-style exponential smoothing toward the target rotation
      const s = 1 - Math.exp(-dt * SMOOTHING)
      ctrl.yaw += (ctrl.targetYaw - ctrl.yaw) * s
      ctrl.pitch += (ctrl.targetPitch - ctrl.pitch) * s
      camera.rotation.set(ctrl.pitch, ctrl.yaw, 0)

      // Keep the pole wordmarks upright relative to the camera's spin, and
      // advance the grain-shimmer clock.
      for (const g of poleGroups) g.rotation.y = ctrl.yaw
      if (polePointsMat) polePointsMat.uniforms.uTime!.value = now / 1000

      // Hover raycast (idle pointer only). Pole marks beat tiles, matching
      // the click priority — they get a pointer cursor but no invert state.
      if (!drag.active && !detailOpenRef.current && pointerNdc.x <= 1) {
        raycaster.setFromCamera(pointerNdc, camera)
        const overPole =
          poleHitMeshes.length > 0 &&
          raycaster.intersectObjects(poleHitMeshes, false).length > 0
        if (overPole) {
          setHovered(null)
          if (canvas.style.cursor !== "pointer") canvas.style.cursor = "pointer"
        } else {
          const hits = raycaster.intersectObjects(tileMeshes, false)
          setHovered(hits.length > 0 ? (hits[0].object as THREE.Mesh) : null)
          const want = hovered ? "pointer" : "grab"
          if (canvas.style.cursor !== want) canvas.style.cursor = want
        }
      }

      renderer.render(scene, camera)
    }
    tick()

    // --- resize --------------------------------------------------------------------------
    const onResize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener("resize", onResize)

    // --- cleanup ----------------------------------------------------------------------------
    return () => {
      cancelAnimationFrame(raf)
      introFlag.kill()
      gsap.killTweensOf(zoom)
      gsap.killTweensOf(introZoom)
      tileMaterials.forEach((m) => gsap.killTweensOf(m))
      window.removeEventListener("resize", onResize)
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", endDrag)
      canvas.removeEventListener("pointercancel", endDrag)
      canvas.removeEventListener("wheel", onWheel)
      loadedImages.forEach((img) => (img.onload = null))
      poleCancelled = true
      poleDispose.forEach((fn) => fn())
      tileMaterials.forEach((m) => m.dispose())
      rowGeometries.forEach((g) => g.dispose())
      cardTextures.forEach((t) => {
        t.normal.dispose()
        t.hover.dispose()
      })
      renderer.dispose()
      if (canvas.parentElement === mount) mount.removeChild(canvas)
      apiRef.current = null
    }
    // Rebuild the whole scene if the project list changes (server-rendered
    // prop — stable per page load, so this runs once in practice).
  }, [projects])

  // --- detail overlay enter animation ------------------------------------------
  // useLayoutEffect so GSAP positions the overlay offscreen BEFORE first paint —
  // the JSX deliberately carries no inline transform (GSAP would absorb it as a
  // permanent base transform and the slide-in would never become visible).
  useLayoutEffect(() => {
    if (!selected) return
    const overlay = overlayRef.current
    const content = overlayContentRef.current
    if (!overlay || !content) return
    const items = content.querySelectorAll("[data-detail-item]")
    const tl = gsap.timeline()
    tl.fromTo(
      overlay,
      { yPercent: 100 },
      { yPercent: 0, duration: 0.85, ease: "power4.inOut", delay: 0.28 }
    ).fromTo(
      items,
      { y: 44, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.07 },
      "-=0.25"
    )
    return () => {
      tl.kill()
    }
  }, [selected])

  const handleClose = useCallback(() => {
    const overlay = overlayRef.current
    if (!overlay) {
      setSelected(null)
      apiRef.current?.close()
      return
    }
    gsap.to(overlay, {
      yPercent: 100,
      duration: 0.7,
      ease: "power4.in",
      onComplete: () => {
        setSelected(null)
        apiRef.current?.close()
      },
    })
  }, [])

  // --- particle playground overlay (pole click) --------------------------------
  // Same slide-up entrance as the card detail page.
  useLayoutEffect(() => {
    if (!particlePlayOpen) return
    const overlay = particleOverlayRef.current
    if (!overlay) return
    const tl = gsap.timeline()
    tl.fromTo(
      overlay,
      { yPercent: 100 },
      { yPercent: 0, duration: 0.85, ease: "power4.inOut", delay: 0.25 }
    )
    return () => {
      tl.kill()
    }
  }, [particlePlayOpen])

  /** Deep link — `?pole=north|south` opens the particle playground directly,
   * making each pole's palette shareable as a URL. Delayed a beat so the
   * sphere intro reads first; a plain timeout (not the gsap intro flag) so
   * the link still resolves when rAF-driven tweens are throttled. */
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("pole")
    if (want !== "north" && want !== "south") return
    const t = window.setTimeout(() => {
      setActivePoleSign(want === "north" ? 1 : -1)
      setParticlePlayOpen(true)
    }, 1600)
    return () => window.clearTimeout(t)
  }, [])

  const handleParticleClose = useCallback(() => {
    const overlay = particleOverlayRef.current
    if (!overlay) {
      setParticlePlayOpen(false)
      apiRef.current?.closePole()
      return
    }
    gsap.to(overlay, {
      yPercent: 100,
      duration: 0.7,
      ease: "power4.in",
      onComplete: () => {
        setParticlePlayOpen(false)
        apiRef.current?.closePole()
      },
    })
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white">
      {/* WebGL mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Vignette — heavy top/bottom falloff like the reference */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0) 16%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.72)), radial-gradient(ellipse 130% 100% at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      {/* ---------------- chrome / overlay UI ---------------- */}
      <div
        className={`pointer-events-none absolute inset-0 z-20 transition-opacity duration-700 ${
          introDone ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* top bar */}
        <div className="absolute left-0 right-0 top-0 flex items-start justify-between px-5 pt-5 small:px-8 small:pt-7">
          <LocalizedClientLink href="/" className="pointer-events-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/sc-prints-logo-white-transparent.png"
              alt="SC Prints"
              className="h-10 w-auto opacity-95 small:h-12"
            />
          </LocalizedClientLink>

          <p className="hidden pt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/50 tablet:block">
            Lookbook [Drag to explore]
          </p>

          <div className="hidden gap-14 medium:flex">
            <p className="max-w-[230px] font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-white/80">
              SC Prints is a custom print studio crafting garments &amp; merch
              for Australian teams.
            </p>
            <StudioClock />
          </div>

          <LocalizedClientLink
            href="/contact"
            className="pointer-events-auto rounded-full bg-white px-6 py-3 text-sm font-semibold !text-black transition-transform duration-300 hover:scale-105"
          >
            Let&apos;s Talk
          </LocalizedClientLink>
        </div>

        {/* bottom-centre nav pills */}
        <nav className="pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center rounded-full bg-white/10 p-1.5 backdrop-blur-sm small:bottom-7">
          {/* !text-black: globals.css paints [class*=rounded-full][class*=text-xs] chips brand-pink */}
          <span className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold !text-black phone:px-5 phone:py-2.5 phone:text-sm">
            Work
          </span>
          <LocalizedClientLink
            href="/lookbook-cube"
            className="rounded-full px-3.5 py-2 text-xs font-medium !text-white/80 transition-colors hover:!text-white phone:px-5 phone:py-2.5 phone:text-sm"
          >
            Cube
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/lookbook"
            className="rounded-full px-3.5 py-2 text-xs font-medium !text-white/80 transition-colors hover:!text-white phone:px-5 phone:py-2.5 phone:text-sm"
          >
            Lookbook
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/contact"
            className="rounded-full px-3.5 py-2 text-xs font-medium !text-white/80 transition-colors hover:!text-white phone:px-5 phone:py-2.5 phone:text-sm"
          >
            Contact
          </LocalizedClientLink>
        </nav>
      </div>

      {/* ---------------- detail page overlay ---------------- */}
      {selected ? (
        <div ref={overlayRef} className="absolute inset-0 z-30 bg-[#0d0d0d]">
          <div ref={overlayContentRef} className="h-full overflow-y-auto">
            <div className="mx-auto max-w-5xl px-6 pb-24 pt-6 small:px-10">
              <div
                data-detail-item
                className="flex items-center justify-between py-4"
              >
                <button
                  onClick={handleClose}
                  className="group flex min-h-11 items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-white/70 transition-colors hover:text-white"
                >
                  <span className="transition-transform duration-300 group-hover:-translate-x-1">
                    ←
                  </span>
                  Back to gallery
                </button>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-white/40">
                  {selected.title}
                </span>
              </div>

              {/* object-contain, not cover — lookbook shots are arbitrary
                  aspect ratios and cover-cropping cut the artwork off */}
              <div
                data-detail-item
                className="flex items-center justify-center overflow-hidden rounded-sm bg-[#161616]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={optimizedSrc(selected.image, 1080)}
                  alt={selected.brand}
                  className="max-h-[55vh] w-auto max-w-full object-contain small:max-h-[62vh]"
                />
              </div>

              {/* brand carries the job name (lookbook item title); title is the
                  studio/credit line — see the page.tsx mapping */}
              <h1
                data-detail-item
                className="mt-10 font-mono text-3xl font-medium uppercase leading-tight tracking-tight small:text-6xl"
              >
                {selected.brand}
              </h1>

              <div
                data-detail-item
                className="mt-6 flex flex-wrap items-center gap-2"
              >
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-white/80">
                  {selected.category}
                </span>
                {selected.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-white/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-white/70"
                  >
                    {t}
                  </span>
                ))}
                <span className="ml-auto font-mono text-xs text-white/40">
                  {selected.year}
                </span>
              </div>

              <p
                data-detail-item
                className="mt-10 max-w-2xl text-base leading-relaxed text-white/70 small:text-lg"
              >
                {selected.blurb}
              </p>

              <div data-detail-item className="mt-12">
                {/* Deep-link to the actual garment's PDP (the studio/customizer)
                    when this tile is linked to a product; otherwise fall back to
                    the contact form. */}
                <LocalizedClientLink
                  href={
                    selected.productHandle
                      ? `/products/${selected.productHandle}`
                      : "/contact"
                  }
                  className="inline-flex items-center gap-3 rounded-full bg-white px-7 py-3.5 text-sm font-semibold !text-black transition-transform duration-300 hover:scale-105"
                >
                  Start a job like this →
                </LocalizedClientLink>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------- particle playground overlay (pole click) ---------------- */}
      {particlePlayOpen ? (
        <div
          ref={particleOverlayRef}
          className="absolute inset-0 z-30 bg-[#0d0d0d]"
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-6 py-4 small:px-10">
              <button
                onClick={handleParticleClose}
                className="group flex min-h-11 items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-white/70 transition-colors hover:text-white"
              >
                <span className="transition-transform duration-300 group-hover:-translate-x-1">
                  ←
                </span>
                Back to gallery
              </button>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-white/40">
                SC Prints · Particle wordmark
              </span>
            </div>

            <div className="min-h-0 flex-1">
              <HomeParticleThree
                hideChrome
                heightClassName="h-full"
                gradientStops={
                  activePoleSign === 1
                    ? POLE_GRADIENT_NORTH
                    : POLE_GRADIENT_SOUTH
                }
              />
            </div>

            <p className="px-6 pb-5 pt-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              Move your cursor through the letters
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
