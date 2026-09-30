"use client"

/**
 * Wordmark rendered as a point cloud you can stir with the cursor.
 * Physics lives in ./engine (fixed 60Hz step); this file is only sampling,
 * rendering, input and the entrance fly-in. Fills its parent — the parent
 * supplies the size and the background.
 */

import { useEffect, useRef } from "react"
import * as THREE from "three"

import { createSim, deposit, step, STEP_S, type Sim } from "./engine"

export type GradientStops = readonly (readonly [number, number, number])[]

const MAX_PARTICLES = 140_000
const TILT_RAD = (8 * Math.PI) / 180
const DEFAULT_COLOR: GradientStops = [
  [235, 235, 235],
  [235, 235, 235],
]

type Props = {
  logoSrc?: string
  /** Left → right colour ramp (0-255 RGB). Omit for plain off-white. */
  gradientStops?: GradientStops
  className?: string
}

export default function FluidWordmark({
  logoSrc = "/branding/sc-prints-logo-transparent.png",
  gradientStops,
  className = "h-full w-full",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let teardown = () => {}
    const img = new Image()
    img.src = logoSrc
    img
      .decode()
      .then(() => {
        if (!disposed) teardown = mount(host, img, gradientStops ?? DEFAULT_COLOR)
      })
      .catch((e) => console.error("[fluid-wordmark] logo failed to load", e))
    return () => {
      disposed = true
      teardown()
    }
  }, [logoSrc, gradientStops])

  return (
    <div
      ref={hostRef}
      className={`relative touch-none overflow-hidden ${className}`}
    />
  )
}

/** Home positions (xy pairs, CSS px) sampled from the logo's alpha. */
function sampleHomes(img: HTMLImageElement, w: number, h: number): Float32Array {
  const narrow = w < 1024
  const ss = narrow ? 1.4 : 1.2
  const cw = Math.floor(w * ss)
  const ch = Math.floor(h * ss)
  const canvas = document.createElement("canvas")
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const fit = narrow ? 0.8 : 0.6
  const scale = Math.min(
    (cw * fit) / img.naturalWidth,
    (ch * fit) / img.naturalHeight
  )
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh)
  const data = ctx.getImageData(0, 0, cw, ch).data

  const stride = narrow ? 1 : 2
  const pts: number[] = []
  for (let y = 0; y < ch; y += stride) {
    for (let x = 0; x < cw; x += stride) {
      if (data[(y * cw + x) * 4 + 3]! > 128) {
        pts.push(
          (x + (Math.random() - 0.5) * stride) / ss,
          (y + (Math.random() - 0.5) * stride) / ss
        )
      }
    }
  }
  let n = pts.length / 2
  if (n > MAX_PARTICLES) {
    // Partial Fisher-Yates: only the kept prefix needs shuffling.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const j = i + ((Math.random() * (n - i)) | 0)
      const ax = pts[i * 2]!
      const ay = pts[i * 2 + 1]!
      pts[i * 2] = pts[j * 2]!
      pts[i * 2 + 1] = pts[j * 2 + 1]!
      pts[j * 2] = ax
      pts[j * 2 + 1] = ay
    }
    n = MAX_PARTICLES
  }
  return new Float32Array(pts.slice(0, n * 2))
}

type Entrance = {
  startT: number
  /** Per particle: startX, startY, delay, duration, amp, freq, phase. */
  data: Float32Array
}

function mount(
  host: HTMLDivElement,
  img: HTMLImageElement,
  stops: GradientStops
): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0, 0)
  Object.assign(renderer.domElement.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
  })
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  const material = new THREE.PointsMaterial({
    sizeAttenuation: false,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
  })
  const points = new THREE.Points(new THREE.BufferGeometry(), material)
  points.matrixAutoUpdate = false
  points.frustumCulled = false
  scene.add(points)

  let sim: Sim | null = null
  let entrance: Entrance | null = null
  let simT = 0

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches

  function build() {
    const w = host.clientWidth
    const h = host.clientHeight
    // A zero-sized host (hidden tab, collapsed parent) has nothing to sample;
    // the ResizeObserver calls back once it has a size.
    if (w === 0 || h === 0) return

    renderer.setSize(w, h, false)
    // Camera sits one viewport-height back so 1 world unit = 1 CSS px at z=0.
    camera.fov = (2 * Math.atan(0.5) * 180) / Math.PI
    camera.aspect = w / h
    camera.near = 0.1
    camera.far = h * 3
    camera.position.set(w / 2, h / 2, h)
    camera.lookAt(w / 2, h / 2, 0)
    camera.updateProjectionMatrix()
    // CSS px (three scales by pixel ratio). Roughly the sample spacing, so
    // letters read as solid. The reference is only this dense on retina —
    // it folds DPR in twice — we look the same on every screen.
    material.size = w < 1024 ? 1 : 1.6

    const home = sampleHomes(img, w, h)
    const n = home.length / 2
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    let minX = Infinity
    let maxX = -Infinity
    for (let i = 0; i < n; i++) {
      const x = home[i * 2]!
      if (x < minX) minX = x
      if (x > maxX) maxX = x
    }
    const span = maxX - minX || 1
    const segs = stops.length - 1
    for (let i = 0; i < n; i++) {
      pos[i * 3] = home[i * 2]!
      pos[i * 3 + 1] = home[i * 2 + 1]!
      const u = ((home[i * 2]! - minX) / span) * segs
      const s = Math.min(segs - 1, Math.floor(u))
      const a = stops[s]!
      const b = stops[s + 1]!
      const f = u - s
      col[i * 3] = (a[0] + (b[0] - a[0]) * f) / 255
      col[i * 3 + 1] = (a[1] + (b[1] - a[1]) * f) / 255
      col[i * 3 + 2] = (a[2] + (b[2] - a[2]) * f) / 255
    }

    points.geometry.dispose()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
    points.geometry = geo
    sim = createSim(w, h, home, pos)

    // Fly-in from the upper right, staggered left → right across the mark.
    entrance = null
    if (!reducedMotion) {
      const data = new Float32Array(n * 7)
      const reach = 1.2 * Math.max(w, h)
      const ang = -0.15 * Math.PI
      for (let i = 0; i < n; i++) {
        const hx = home[i * 2]!
        const hy = home[i * 2 + 1]!
        const sx = hx + Math.cos(ang) * reach + (Math.random() - 0.5) * 300
        const sy = hy + Math.sin(ang) * reach + (Math.random() - 0.5) * h * 0.8
        data.set(
          [
            sx,
            sy,
            0.43 * Math.random() + (0.58 * (hx - minX)) / span,
            1 + 0.43 * Math.random(),
            20 + 40 * Math.random(),
            2 + 3 * Math.random(),
            Math.random() * Math.PI * 2,
          ],
          i * 7
        )
        pos[i * 3] = sx
        pos[i * 3 + 1] = sy
      }
      entrance = { startT: simT, data }
    }
  }

  function entranceStep(s: Sim, e: Entrance) {
    const elapsed = simT - e.startT
    const d = e.data
    let done = true
    for (let i = 0; i < s.count; i++) {
      const o = i * 7
      const local = elapsed - d[o + 2]!
      if (local < 0) {
        done = false
        continue
      }
      const l = Math.min(1, local / d[o + 3]!)
      if (l < 1) done = false
      const ease = l === 1 ? 1 : 1 - Math.pow(2, -10 * l)
      const sx = d[o]!
      const sy = d[o + 1]!
      const tx = s.home[i * 2]! - sx
      const ty = s.home[i * 2 + 1]! - sy
      const len = Math.hypot(tx, ty) || 1
      // Sideways wobble that dies out as the particle lands.
      const wob = Math.sin(l * d[o + 5]! * Math.PI + d[o + 6]!) * d[o + 4]! * (1 - l)
      s.pos[i * 3] = sx + tx * ease + (-ty / len) * wob
      s.pos[i * 3 + 1] = sy + ty * ease + (tx / len) * wob
    }
    if (done) entrance = null
  }

  // --- input -----------------------------------------------------------------
  const cur = { x: 0, y: 0, on: false }
  const prev = { x: 0, y: 0 }
  const tilt = { tx: 0, ty: 0, x: 0, y: 0 }

  const onMove = (e: PointerEvent) => {
    const rect = host.getBoundingClientRect()
    cur.x = e.clientX - rect.left
    cur.y = e.clientY - rect.top
    if (!cur.on) {
      // First contact: no stroke from wherever the pointer last was.
      prev.x = cur.x
      prev.y = cur.y
      cur.on = true
    }
    tilt.tx = (cur.x / rect.width - 0.5) * 2
    tilt.ty = (cur.y / rect.height - 0.5) * 2
  }
  const onDown = (e: PointerEvent) => {
    cur.on = false
    onMove(e)
  }
  const onLeave = () => {
    cur.on = false
    tilt.tx = 0
    tilt.ty = 0
  }
  host.addEventListener("pointermove", onMove)
  host.addEventListener("pointerdown", onDown)
  host.addEventListener("pointerleave", onLeave)
  host.addEventListener("pointercancel", onLeave)

  // --- loop ------------------------------------------------------------------
  function tick() {
    simT += STEP_S
    const s = sim
    if (!s) return
    if (entrance) {
      entranceStep(s, entrance)
    } else {
      if (cur.on && (cur.x !== prev.x || cur.y !== prev.y)) {
        deposit(s, prev.x, prev.y, cur.x, cur.y)
      }
      step(s, simT)
    }
    prev.x = cur.x
    prev.y = cur.y
    tilt.x += (tilt.tx - tilt.x) * 0.08
    tilt.y += (tilt.ty - tilt.y) * 0.08
  }

  const toCentre = new THREE.Matrix4()
  const fromCentre = new THREE.Matrix4()
  const rot = new THREE.Matrix4()
  const flipY = new THREE.Matrix4().makeScale(1, -1, 1)
  const euler = new THREE.Euler()

  let raf = 0
  let last = 0
  let acc = 0
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    acc += Math.min(0.05, (now - last) / 1000)
    last = now
    // Fixed 60Hz steps so the per-step constants feel the same on 120Hz
    // displays. 1ms slack stops a 60Hz display from skipping on jitter.
    let n = 0
    while (acc >= STEP_S - 0.001 && n++ < 3) {
      acc -= STEP_S
      tick()
    }
    if (acc > STEP_S) acc = 0
    const s = sim
    if (!s || n === 0) return

    toCentre.makeTranslation(-s.w / 2, -s.h / 2, 0)
    fromCentre.makeTranslation(s.w / 2, s.h / 2, 0)
    rot.makeRotationFromEuler(euler.set(tilt.y * TILT_RAD, tilt.x * TILT_RAD, 0))
    points.matrix
      .identity()
      .multiply(fromCentre)
      .multiply(rot)
      .multiply(flipY)
      .multiply(toCentre)
    points.matrixWorldNeedsUpdate = true
    points.geometry.attributes.position!.needsUpdate = true
    renderer.render(scene, camera)
  }
  const start = () => {
    if (raf) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }

  // Off-screen = no sim, no draw.
  const io = new IntersectionObserver(([entry]) =>
    entry?.isIntersecting ? start() : stop()
  )
  io.observe(host)

  let resizeTimer = 0
  let builtW = 0
  let builtH = 0
  const ro = new ResizeObserver(() => {
    const w = host.clientWidth
    const h = host.clientHeight
    // Mobile URL-bar show/hide changes height by a few dozen px — not worth
    // re-sampling and replaying the entrance.
    if (Math.abs(w - builtW) < 10 && Math.abs(h - builtH) < 150 && builtW > 0) return
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(
      () => {
        builtW = w
        builtH = h
        build()
      },
      builtW === 0 ? 0 : 200
    )
  })
  ro.observe(host)

  return () => {
    stop()
    io.disconnect()
    ro.disconnect()
    window.clearTimeout(resizeTimer)
    host.removeEventListener("pointermove", onMove)
    host.removeEventListener("pointerdown", onDown)
    host.removeEventListener("pointerleave", onLeave)
    host.removeEventListener("pointercancel", onLeave)
    points.geometry.dispose()
    material.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
