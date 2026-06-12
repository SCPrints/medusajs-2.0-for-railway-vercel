"use client"

/**
 * Three.js Points-mesh particle hero.
 *
 * Renders the SC Prints wordmark as a 140k-point cloud and reacts to the
 * cursor with two layered behaviours:
 *
 *   1. CARRY MODEL (in-disk) — particles inside the cursor disk (by
 *      current position) lerp toward an anchor slightly behind the cursor
 *      along −motion, with Newmix-style side swirl. Targets use current
 *      position, not home, so the whole captured blob travels with the
 *      pointer — this builds the bright leading lobe under additive blend.
 *
 *   2. VELOCITY FIELD (default, `fieldMode`) — the actual newmix
 *      mechanism. Cursor strokes deposit velocity into a coarse Stam-style
 *      fluid grid (semi-Lagrangian advection + pressure projection +
 *      decay, reusing the canvas hero's `velocity-field.ts`); particles
 *      sample the grid bilinearly and ride the FLUID with a home spring
 *      that's suppressed while the local field is energetic. Nothing
 *      replays cursor history: a particle's journey starts when the moving
 *      fluid (or the disk) reaches it, and recovery is the field decaying.
 *
 *   3. CURSOR-HISTORY WAKE (legacy, `fieldMode` off) — released particles
 *      replay the cursor's recorded path from the moment of interaction
 *      (playhead clamped to release time) with band spread, curl
 *      oscillation, and a post-wake settle meander. Choreographed rather
 *      than simulated; kept selectable for comparison via preset 6.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import {
  advectVelocityField,
  clearVelocityField,
  createVelocityField,
  decayVelocityField,
  diffuseVelocityField,
  injectVelocity,
  pressureProjectVelocityField,
  sampleVelocityField,
  type VelocityField,
} from "../home-particle-logo-hero/velocity-field"
import {
  sampleWordmarkStipple,
  type StipplePoint,
} from "./sample-wordmark"
import ThreeTunerPanel, {
  loadStoredTuning,
  type ThreeTuning,
} from "./tuner-panel"

/** Velocity-field grid constants (field mode). The field covers the wordmark
 * plus a margin so strokes approaching the letters push fluid ahead of the
 * cursor before it arrives. Resolution = cells along the longer axis. */
const FIELD_RESOLUTION = 120
const FIELD_MARGIN_FRAC = 0.4
/** Stroke deposit subdivision (world px) — fast flicks splat velocity at
 * every step along the path instead of one blob per frame. */
const FIELD_SUBDIV_PX = 6
/** Hard cap on per-particle speed (world px/frame) — keeps a hot field from
 * slingshotting grains across the canvas. */
const FIELD_VEL_CAP = 55
/** Field is considered live for this long after the last deposit. Beyond it
 * the whole field branch (step + 140k bilinear samples) is skipped — by then
 * decay has reduced the grid to noise. */
const FIELD_LIVE_MS = 7000

/** Live field diagnostics — written by the sim loop every frame while the
 * debug overlay is on, read by the caption readout at 4Hz. Module-level
 * mutable so the 60fps writes never touch React state. */
export const FIELD_DEBUG_STATS = {
  /** Largest |vx|+|vy| across the grid this frame. */
  maxL1: 0,
  /** % of cells whose L1 magnitude exceeds the activation threshold. */
  activePct: 0,
  /** ms since the last stroke deposit (-1 = never). */
  msSinceDeposit: -1,
}

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute float aTrail;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uDebug;
  varying vec3 vColor;
  void main() {
    // Debug tint: magenta for trailing particles when uDebug == 1.
    vColor = mix(aColor, vec3(1.0, 0.15, 1.0), aTrail * uDebug);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Trailing particles get a small size boost in debug so they stand out.
    float sizeBoost = 1.0 + aTrail * uDebug * 0.6;
    gl_PointSize = uPointSize * uPixelRatio * sizeBoost * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.25, d);
    gl_FragColor = vec4(vColor, a);
  }
`

export type GradientStops = readonly [number, number, number][]

/** Default rainbow — used when the embedder doesn't pass `gradientStops`. */
const WORDMARK_GRADIENT_STOPS: GradientStops = [
  [255, 64, 64],
  [255, 165, 0],
  [255, 230, 0],
  [80, 220, 100],
  [60, 170, 240],
  [120, 90, 220],
  [220, 80, 200],
]

type CursorSample = { x: number; y: number; t: number }

/**
 * Linear-interpolated sample from the cursor history at `targetTime`
 * (wall-clock ms). Returns the head if past the latest sample, the tail
 * if before the oldest, and null only if the buffer is empty. Uses
 * binary search to find the segment in O(log n).
 */
function lookupCursorHistoryAtTime(
  history: CursorSample[],
  targetTime: number
): { x: number; y: number } | null {
  const n = history.length
  if (n === 0) return null
  const head = history[n - 1]!
  if (targetTime >= head.t) return { x: head.x, y: head.y }
  const tail = history[0]!
  if (targetTime <= tail.t) return { x: tail.x, y: tail.y }
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1
    if (history[mid]!.t <= targetTime) lo = mid
    else hi = mid
  }
  const a = history[lo]!
  const b = history[hi]!
  const span = b.t - a.t
  const u = span > 1e-6 ? (targetTime - a.t) / span : 0
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
}

/** Newmix-style tangential + front/back offsets (position space, px/frame). */
function swirlOffsetForParticle(
  px: number,
  py: number,
  mx: number,
  my: number,
  cursorRadius: number,
  motionUx: number,
  motionUy: number,
  motionSpeed: number,
  nm: ThreeTuning
): { ox: number; oy: number } {
  const dx = px - mx
  const dy = py - my
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-4 || dist >= cursorRadius) {
    return { ox: 0, oy: 0 }
  }
  const motionScale = Math.min(
    1,
    motionSpeed / Math.max(0.01, nm.motionGateSpeed)
  )
  if (motionScale < 1e-3) {
    return { ox: 0, oy: 0 }
  }

  const ux = dx / dist
  const uy = dy / dist
  const edge = Math.max(0, (cursorRadius - dist) / cursorRadius)
  const falloff = Math.pow(edge, nm.falloffPower)

  const fxf = motionUx
  const fyf = motionUy
  const rx = -fyf
  const ry = fxf
  const along = dx * fxf + dy * fyf
  const perp = dx * rx + dy * ry
  const alongN = along / cursorRadius

  const ccwX = -uy
  const ccwY = ux
  const vSgn = perp >= 0 ? -1 : 1
  const tvx = vSgn * ccwX
  const tvy = vSgn * ccwY

  let ox = 0
  let oy = 0

  const sideGauss = Math.exp(-Math.pow(alongN / 0.7, 2))
  const sideSw = nm.sideSwirlForce * falloff * sideGauss * motionScale
  ox += tvx * sideSw
  oy += tvy * sideSw

  if (alongN > 0.07) {
    const cap = Math.min(1, (alongN - 0.07) / 0.5)
    const push = nm.frontPush * falloff * cap * motionScale
    ox += ux * push
    oy += uy * push
  }
  if (alongN < -0.04) {
    const back = Math.min(1, -alongN / 0.62)
    const inward = nm.backInward * falloff * back * motionScale
    ox -= ux * inward
    oy -= uy * inward
  }

  return { ox, oy }
}

type ParticleFieldProps = {
  stipple: StipplePoint[]
  width: number
  height: number
  particleCount: number
  tuningRef: React.MutableRefObject<ThreeTuning>
  logoFit?: "contain" | "cover"
  useImageColors?: boolean
  gradientStops?: GradientStops
}

function ParticleField({
  stipple,
  width,
  height,
  particleCount,
  tuningRef,
  logoFit = "contain",
  useImageColors = false,
  gradientStops,
}: ParticleFieldProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const { size, camera, gl } = useThree()
  const mouseWorld = useRef<{ x: number; y: number } | null>(null)
  /** Smoothed cursor position. Each onMove samples are smoothed
   * exponentially toward this ref so the history buffer doesn't carry
   * noisy raw pointer jitter. */
  const smoothedCursor = useRef<{ x: number; y: number } | null>(null)
  const prevSmoothedCursor = useRef<{ x: number; y: number } | null>(null)
  /** Low-passed unit vector of cursor motion (bitmap/world px per frame). */
  const motionDirRef = useRef({ ux: 1, uy: 0 })
  const motionSpeedRef = useRef(0)
  /** Ring buffer of recent cursor positions with timestamps. Particles
   * read this when they're in the trailing state to follow the cursor's
   * historical path. Trimmed every frame in useFrame. */
  const cursorHistory = useRef<CursorSample[]>([])
  /** Wall-clock ms of the last field deposit — gates the whole field
   * branch (grid step + per-particle sampling) when the fluid has died. */
  const lastDepositRef = useRef(0)
  /** Tracks the live→dead edge so the grid is flushed exactly once. */
  const fieldWasLiveRef = useRef(false)
  /** Reusable out-param for bilinear field samples (no per-particle alloc). */
  const fieldSampleRef = useRef<[number, number]>([0, 0])

  /** Build BufferGeometry + ShaderMaterial + per-particle state arrays
   * once when stipple/count changes. */
  const { geometry, material, state } = useMemo(() => {
    const count = Math.min(particleCount, stipple.length)
    const positions = new Float32Array(count * 3)
    const homes = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)

    const halfW = width / 2
    const halfH = height / 2

    /** Shuffle stipple indices so a low particleCount still samples
     * evenly across the wordmark. Fisher-Yates. */
    const indices = new Uint32Array(stipple.length)
    for (let i = 0; i < stipple.length; i++) indices[i] = i
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = indices[i]!
      indices[i] = indices[j]!
      indices[j] = t
    }

    /** Per-particle deterministic hash. Seeded from quantised home (x,y)
     * so each particle gets stable wake-jitter parameters across frames. */
    const trailHash = new Uint32Array(count)

    for (let i = 0; i < count; i++) {
      const sp = stipple[indices[i]!]!
      const wx = sp.x - halfW
      const wy = halfH - sp.y
      const i3 = i * 3
      positions[i3 + 0] = wx
      positions[i3 + 1] = wy
      positions[i3 + 2] = 0
      homes[i3 + 0] = wx
      homes[i3 + 1] = wy
      homes[i3 + 2] = 0
      trailHash[i] =
        (((wx | 0) * 2654435761) ^ ((wy | 0) * 1597334677)) >>> 0

      if (useImageColors && sp.r !== undefined) {
        colors[i3 + 0] = sp.r
        colors[i3 + 1] = sp.g!
        colors[i3 + 2] = sp.b!
      } else {
        const stops = gradientStops ?? WORDMARK_GRADIENT_STOPS
        const t = sp.u
        const segCount = stops.length - 1
        const segPos = t * segCount
        let segIdx = Math.floor(segPos)
        if (segIdx >= segCount) segIdx = segCount - 1
        const localT = segPos - segIdx
        const c1 = stops[segIdx]!
        const c2 = stops[segIdx + 1]!
        colors[i3 + 0] = (c1[0] + (c2[0] - c1[0]) * localT) / 255
        colors[i3 + 1] = (c1[1] + (c2[1] - c1[1]) * localT) / 255
        colors[i3 + 2] = (c1[2] + (c2[2] - c1[2]) * localT) / 255
      }
    }

    /** Per-particle trailing state.
     *   trailUntil[i]   — wall-clock ms; 0 = not trailing
     *   releaseTime[i]  — wall-clock ms when this particle entered trail
     *   trailOffX/Y[i]  — particle position MINUS cursor position at
     *                     release. Lets the wake start at the particle's
     *                     actual interaction point and fade onto the
     *                     cursor path over time, instead of teleporting
     *                     every particle straight onto the history line.
     *   wasInDisk[i]    — 1 if particle was in disk last frame (edge detect)
     *   trailFlags[i]   — 0 or 1, mirrored to the GPU each frame as aTrail
     *                     so the shader can tint debug-mode particles. */
    const trailUntil = new Float32Array(count)
    const releaseTime = new Float32Array(count)
    const trailOffX = new Float32Array(count)
    const trailOffY = new Float32Array(count)
    const wasInDisk = new Uint8Array(count)
    const trailFlags = new Float32Array(count)
    /** settleUntil[i] — wall-clock ms; while in the future the particle
     * meanders home (post-wake diffusive settle) instead of beelining. */
    const settleUntil = new Float32Array(count)
    /** Per-particle velocity (world px/frame) — only integrated in field
     * mode, where particles are fluid tracers instead of lerp targets. */
    const velX = new Float32Array(count)
    const velY = new Float32Array(count)

    /** Velocity-field grid (field mode). World→field transform is a plain
     * shift: fieldX = worldX + fieldHalfW, fieldY = worldY + fieldHalfH —
     * no y-flip needed, the grid is orientation-agnostic as long as inject
     * and sample share the mapping. */
    const fieldMargin = width * FIELD_MARGIN_FRAC
    const fieldW = width + fieldMargin * 2
    const fieldH = height + fieldMargin * 2
    const field = createVelocityField(fieldW, fieldH, FIELD_RESOLUTION)
    const fieldScratch2 = new Float32Array(field.cols * field.rows * 2)
    const fieldScratchP = new Float32Array(field.cols * field.rows)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3))
    geo.setAttribute("aTrail", new THREE.BufferAttribute(trailFlags, 1))

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPointSize: { value: tuningRef.current.pointSize },
        uPixelRatio: { value: 1 },
        uDebug: { value: tuningRef.current.debugOverlay ? 1 : 0 },
      },
    })

    return {
      geometry: geo,
      material: mat,
      state: {
        positions,
        homes,
        trailHash,
        trailUntil,
        releaseTime,
        trailOffX,
        trailOffY,
        wasInDisk,
        trailFlags,
        settleUntil,
        velX,
        velY,
        field,
        fieldScratch2,
        fieldScratchP,
        fieldHalfW: fieldW / 2,
        fieldHalfH: fieldH / 2,
        count,
      },
    }
  }, [stipple, particleCount, width, height, tuningRef, gradientStops, useImageColors])

  useEffect(() => {
    material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2)
  }, [material])

  /** Cursor tracking: project NDC mouse onto z=0, smooth exponentially,
   * append to history buffer. History trimming happens in useFrame so
   * this handler stays light. */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = (e.target as HTMLElement)?.getBoundingClientRect?.()
      if (!rect) {
        mouseWorld.current = null
        return
      }
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      const vec = new THREE.Vector3(ndcX, ndcY, 0.5)
      vec.unproject(camera)
      const dir = vec.sub(camera.position).normalize()
      const distance = -camera.position.z / dir.z
      const pos = camera.position
        .clone()
        .add(dir.multiplyScalar(distance))
      mouseWorld.current = { x: pos.x, y: pos.y }

      const sm = smoothedCursor.current
      const SMOOTH_K = 0.35
      let cur: { x: number; y: number }
      if (sm == null) {
        cur = { x: pos.x, y: pos.y }
        smoothedCursor.current = cur
      } else {
        sm.x += (pos.x - sm.x) * SMOOTH_K
        sm.y += (pos.y - sm.y) * SMOOTH_K
        cur = sm
      }
      const now = performance.now()
      cursorHistory.current.push({ x: cur.x, y: cur.y, t: now })
    }
    const onLeave = () => {
      mouseWorld.current = null
      smoothedCursor.current = null
    }
    // Use THIS scene's canvas — document.querySelector("canvas") grabbed the
    // first canvas in the DOM, which is the wrong one when the particle
    // field is embedded in a page that already renders WebGL (e.g. the
    // lookbook sphere's pole-wordmark overlay).
    const dom = gl.domElement
    dom.addEventListener("mousemove", onMove)
    dom.addEventListener("mouseleave", onLeave)
    return () => {
      dom.removeEventListener("mousemove", onMove)
      dom.removeEventListener("mouseleave", onLeave)
    }
  }, [camera, gl])

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    const {
      positions,
      homes,
      trailHash,
      trailUntil,
      releaseTime,
      trailOffX,
      trailOffY,
      wasInDisk,
      trailFlags,
      settleUntil,
      velX,
      velY,
      field,
      fieldScratch2,
      fieldScratchP,
      fieldHalfW,
      fieldHalfH,
      count,
    } = state
    const nm = tuningRef.current
    if (material.uniforms.uPointSize!.value !== nm.pointSize) {
      material.uniforms.uPointSize!.value = nm.pointSize
    }
    const debugOn = nm.debugOverlay ? 1 : 0
    if (material.uniforms.uDebug!.value !== debugOn) {
      material.uniforms.uDebug!.value = debugOn
    }

    const nowTick = performance.now()

    /** Trim cursor history each frame to (trailFollowMs + wakeTimeOffsetMs
     * + 500ms slack). Buffer length is bounded by sampling rate × window. */
    const histCutoff = nowTick - (nm.trailFollowMs + nm.wakeTimeOffsetMs + 500)
    const hist = cursorHistory.current
    while (hist.length > 0 && hist[0]!.t < histCutoff) hist.shift()

    const smCur = smoothedCursor.current
    const smPrev = prevSmoothedCursor.current
    if (smCur != null && smPrev != null) {
      const mdx = smCur.x - smPrev.x
      const mdy = smCur.y - smPrev.y
      const frameSpeed = Math.hypot(mdx, mdy)
      if (frameSpeed > 0.15) {
        const ux = mdx / frameSpeed
        const uy = mdy / frameSpeed
        const k = 0.45
        const dir = motionDirRef.current
        dir.ux += (ux - dir.ux) * k
        dir.uy += (uy - dir.uy) * k
        const dlen = Math.hypot(dir.ux, dir.uy)
        if (dlen > 1e-5) {
          dir.ux /= dlen
          dir.uy /= dlen
        }
        motionSpeedRef.current = frameSpeed
      } else {
        motionSpeedRef.current *= 0.85
      }
    }
    /** FIELD STEP — cursor stroke deposits velocity into the grid, then the
     * grid runs one Stam tick: advect (energy travels in its own direction)
     * → diffuse (seeps sideways) → pressure-project (divergence removed so
     * vortices curl instead of smearing) → decay. Particles sample the
     * result below. This is the actual newmix mechanism: the cursor stirs
     * a fluid, and the FLUID moves the particles — nothing replays cursor
     * history, so a particle's journey starts at the moment the moving
     * fluid (or the disk) reaches it. */
    const dtMs = dt * 1000
    if (nm.fieldMode) {
      if (smCur != null && smPrev != null) {
        const sdx = smCur.x - smPrev.x
        const sdy = smCur.y - smPrev.y
        const strokeDist = Math.hypot(sdx, sdy)
        if (strokeDist > 0.5) {
          lastDepositRef.current = nowTick
          /** Subdivide so fast flicks splat along the whole path — each
           * step deposits FULL strength (a flick injects more total energy
           * than a slow drag, matching the stirring metaphor). */
          const steps = Math.max(1, Math.ceil(strokeDist / FIELD_SUBDIV_PX))
          for (let s = 1; s <= steps; s++) {
            const u = s / steps
            injectVelocity(
              field,
              smPrev.x + sdx * u + fieldHalfW,
              smPrev.y + sdy * u + fieldHalfH,
              sdx,
              sdy,
              nm.fieldRadius,
              nm.fieldStrength
            )
          }
        }
      }
      if (nowTick - lastDepositRef.current < FIELD_LIVE_MS) {
        advectVelocityField(field, fieldScratch2, nm.fieldAdvection, dtMs)
        diffuseVelocityField(field, nm.fieldDiffusion, fieldScratch2)
        pressureProjectVelocityField(field, fieldScratchP, nm.fieldProjection, 1)
        /** decayPerSec semantics: fraction removed per second, applied as
         * (1-k)^dt — at k >= 1 that is 0^dt and the WHOLE field hard-zeros
         * every frame (found live 2026-06-13: "deposits register, field
         * max 0.0"). Clamp away from the cliff. */
        decayVelocityField(field, Math.min(0.95, nm.fieldDecay), dtMs)
        /** Per-cell hygiene, one pass:
         *  - Deadband: zero near-silent cells so the Sobel projection's
         *    checkerboard mode can't breed out of numerical dust, keeping
         *    the resting wordmark crisp.
         *  - Hard cap: the inject falloff peaks at radius/4 × strength, so
         *    stacked subdivided splats can push cells to hundreds of
         *    px/frame — clamping at the grid bounds the worst-case energy
         *    a stroke can put into the fluid (the 2026-06-13 wipeout). */
        const fvx = field.vx
        const fvy = field.vy
        const cells = field.cols * field.rows
        const cellCap = nm.fieldCellCap
        let dbgMax = 0
        let dbgActive = 0
        for (let ci = 0; ci < cells; ci++) {
          const cvx = fvx[ci]!
          const cvy = fvy[ci]!
          if (cvx < 0.02 && cvx > -0.02 && cvy < 0.02 && cvy > -0.02) {
            fvx[ci] = 0
            fvy[ci] = 0
          } else {
            if (cvx > cellCap) fvx[ci] = cellCap
            else if (cvx < -cellCap) fvx[ci] = -cellCap
            if (cvy > cellCap) fvy[ci] = cellCap
            else if (cvy < -cellCap) fvy[ci] = -cellCap
            const l1 =
              (fvx[ci]! < 0 ? -fvx[ci]! : fvx[ci]!) +
              (fvy[ci]! < 0 ? -fvy[ci]! : fvy[ci]!)
            if (l1 > dbgMax) dbgMax = l1
            if (l1 > nm.fieldActivation) dbgActive++
          }
        }
        FIELD_DEBUG_STATS.maxL1 = dbgMax
        FIELD_DEBUG_STATS.activePct = (dbgActive / cells) * 100
        FIELD_DEBUG_STATS.msSinceDeposit =
          lastDepositRef.current > 0 ? nowTick - lastDepositRef.current : -1
      }
    }
    const fieldLive =
      nm.fieldMode && nowTick - lastDepositRef.current < FIELD_LIVE_MS
    /** On the live→dead transition, flush the grid outright so no residue
     * (numerical or otherwise) waits around for the next stroke. */
    if (!fieldLive && fieldWasLiveRef.current) {
      clearVelocityField(field)
      FIELD_DEBUG_STATS.maxL1 = 0
      FIELD_DEBUG_STATS.activePct = 0
    }
    fieldWasLiveRef.current = fieldLive

    if (smCur != null) {
      prevSmoothedCursor.current = { x: smCur.x, y: smCur.y }
    }

    const motionUx = motionDirRef.current.ux
    const motionUy = motionDirRef.current.uy
    const motionSpeed = motionSpeedRef.current

    const mw = mouseWorld.current
    const mx = mw?.x ?? 0
    const my = mw?.y ?? 0
    const haveCursor = mw != null
    const cursorRadius = nm.cursorRadius
    const radSq = cursorRadius * cursorRadius
    const voidR = nm.cursorDisplacement

    const inAlpha = Math.min(1.0, nm.inBlend * dt)
    const outAlpha = Math.min(1.0, nm.outBlend * dt)

    const trailFollowMs = nm.trailFollowMs
    const wakePace = nm.wakePace
    const wakePaceJitter = nm.wakePaceJitter
    const wakeTimeOffsetMs = nm.wakeTimeOffsetMs
    const wakeAlongStretchBmp = nm.wakeAlongStretchBmp
    const wakeBandSpreadBmp = nm.wakeBandSpreadBmp
    const wakeReleaseStaggerMs = nm.wakeReleaseStaggerMs
    const trailingProbability = nm.trailingProbability
    const wakeCurlHz = nm.wakeCurlHz
    const settleMs = nm.settleMs
    const settleWobbleAmp = nm.settleWobbleAmp

    /** Field-mode per-frame factors, hoisted out of the 140k loop. dtF
     * normalises to a 60fps reference frame so the integration is
     * frame-rate independent. */
    const fieldMode = nm.fieldMode
    const dtF = dt * 60
    const fieldRide = nm.fieldRide
    const fieldActivation = nm.fieldActivation
    const springBase = nm.homeSpring * dtF
    const springEnergized = springBase * nm.energizedSpringScale
    const frictionFactor = Math.pow(nm.fieldFriction, dtF)
    const velCapSq = FIELD_VEL_CAP * FIELD_VEL_CAP
    const fieldSampleOut = fieldSampleRef.current

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const hx = homes[i3]!
      const hy = homes[i3 + 1]!
      let px = positions[i3]!
      let py = positions[i3 + 1]!

      const tUntil = trailUntil[i]!
      const trailing = tUntil > 0 && nowTick < tUntil

      if (trailing) {
        /** WAKE PLAYBACK — particle is driven by cursor history. */
        const h = trailHash[i]!
        const rand01 = (h & 0xffffff) / 0xffffff
        const rand2 = (((h >>> 8) * 2246822519) >>> 0 & 0xffffff) / 0xffffff
        const rand3 = (((h >>> 16) * 374761393) >>> 0 & 0xffffff) / 0xffffff
        const rand4 = (((h >>> 4) * 3266489917) >>> 0 & 0xffffff) / 0xffffff

        const release = releaseTime[i]!
        const stagger = rand3 * wakeReleaseStaggerMs
        const elapsed = nowTick - release - stagger

        if (elapsed > 0) {
          const paceFactor = 1 + (rand01 * 2 - 1) * wakePaceJitter
          const particlePace = Math.max(0.05, wakePace * paceFactor)
          const timeOffset = rand4 * rand4 * wakeTimeOffsetMs
          /** Clamped to >= release: a particle's journey starts where the
           * cursor was AT the moment it touched it — never earlier. Without
           * the clamp, timeOffset pointed the playhead into history from
           * BEFORE the interaction, so particles teleported back along the
           * cursor's pre-contact path (e.g. toward where the mouse entered
           * the canvas). The offset now acts as a hold-then-go delay. */
          const playheadT = Math.max(
            release,
            release + stagger + elapsed * particlePace - timeOffset
          )

          const sample = lookupCursorHistoryAtTime(hist, playheadT)
          if (sample != null) {
            let tanX = 1
            let tanY = 0
            let perpX = 0
            let perpY = 0
            const lookAhead = lookupCursorHistoryAtTime(hist, playheadT + 50)
            if (lookAhead != null) {
              const tdx = lookAhead.x - sample.x
              const tdy = lookAhead.y - sample.y
              const tlen = Math.hypot(tdx, tdy)
              if (tlen > 1e-3) {
                tanX = tdx / tlen
                tanY = tdy / tlen
                perpX = -tanY
                perpY = tanX
              }
            }

            const wakeTotalMs = Math.max(1, trailFollowMs - stagger)
            const u = Math.max(0, Math.min(1, elapsed / wakeTotalMs))
            /** Quadratic taper — band collapses toward the trail end so
             * the ribbon reads as a teardrop (wide at cursor, thin at tail). */
            const taper = (1 - u) * (1 - u)

            const swirlSide = rand2 < 0.5 ? -1 : 1
            const isCore = rand2 < 0.3
            const magnitudeMul = isCore
              ? 0.15 + rand2 * 0.5
              : 0.7 + rand2 * 0.6

            /** Slow billow — the band offset oscillates across the path
             * (per-particle phase) instead of holding one side, so the
             * ribbon curls into tongues like the reference's wake rather
             * than reading as a straight comb. wakeCurlHz=0 → cos of the
             * phase alone, a fixed per-particle value ≈ the old look. */
            const curl =
              wakeCurlHz > 0
                ? Math.cos(
                    elapsed * 0.001 * wakeCurlHz * Math.PI * 2 +
                      rand4 * Math.PI * 2
                  )
                : 1

            const bandAmp =
              wakeBandSpreadBmp * swirlSide * magnitudeMul * taper * curl
            const stretchSign = rand01 * 2 - 1
            const stretchAmp = wakeAlongStretchBmp * stretchSign

            /** Release-relative offset: at release we recorded the
             * particle's position relative to the cursor. Apply it here
             * scaled by offDecay so at elapsed=0 the particle is at its
             * release position (sample + originalOffset = particle's
             * actual position when released), and by elapsed=trailFollowMs
             * the offset has decayed to 0 and the particle has converged
             * to the pure cursor path. This is what makes the wake LOOK
             * like particles peeling off where the cursor touched them
             * instead of teleporting onto an arbitrary history point. */
            const offDecay = 1 - u
            const offX = trailOffX[i]! * offDecay
            const offY = trailOffY[i]! * offDecay

            px =
              sample.x + offX + tanX * stretchAmp + perpX * bandAmp
            py =
              sample.y + offY + tanY * stretchAmp + perpY * bandAmp
          }
          /** If sample is null (history empty), particle holds last position. */
        }
        /** Else: pre-stagger — particle holds release position. */

        positions[i3] = px
        positions[i3 + 1] = py
        trailFlags[i] = 1
        /** While trailing, suppress disk detection so we don't immediately
         * re-trail when the trail-band particle wanders back through. */
        wasInDisk[i] = 0
        continue
      } else if (tUntil > 0) {
        /** Trail just ended — clear the flag so next disk visit can re-arm,
         * and start the settle meander so the particle drifts home along a
         * wandering path instead of beelining (the reference's slow
         * diffusive recovery). */
        trailUntil[i] = 0
        trailFlags[i] = 0
        if (settleMs > 0) settleUntil[i] = nowTick + settleMs
      }

      /** CARRY MODEL — disk test uses current position so carried grains
       * stay captured; anchor sits behind the cursor with side swirl. */
      let targetX = hx
      let targetY = hy
      let inDisk = false

      if (haveCursor) {
        const dx = px - mx
        const dy = py - my
        const distSq = dx * dx + dy * dy
        if (distSq < radSq) {
          inDisk = true
          const dist = Math.sqrt(Math.max(distSq, 0.001))
          const norm = 1 - dist / cursorRadius
          const falloff = norm * norm
          const motionScale = Math.min(
            1,
            motionSpeed / Math.max(0.01, nm.motionGateSpeed)
          )
          const lag = nm.carryLagBehind * falloff * motionScale
          let anchorX = mx - motionUx * lag
          let anchorY = my - motionUy * lag
          const swirl = swirlOffsetForParticle(
            px,
            py,
            mx,
            my,
            cursorRadius,
            motionUx,
            motionUy,
            motionSpeed,
            nm
          )
          anchorX += swirl.ox
          anchorY += swirl.oy

          const carry = Math.min(1, nm.carryStrength * falloff)
          targetX = px + (anchorX - px) * carry
          targetY = py + (anchorY - py) * carry

          if (voidR > 0) {
            const tdx = targetX - mx
            const tdy = targetY - my
            const td = Math.hypot(tdx, tdy)
            if (td < voidR && td > 0.001) {
              const s = voidR / td
              targetX = mx + tdx * s
              targetY = my + tdy * s
            }
          }
        }
      }

      /** FIELD MODE — particles are fluid tracers. In-disk carry is kept
       * (it builds the bright leading lobe under additive blending); the
       * moment a particle is outside the disk its motion comes from the
       * velocity field + a home spring that's suppressed while the local
       * fluid is energetic. No cursor-history playback, no settle
       * choreography — recovery is the field decaying. */
      if (fieldMode) {
        if (inDisk) {
          const prevX = px
          const prevY = py
          px += (targetX - px) * inAlpha
          py += (targetY - py) * inAlpha
          /** Hand the carry motion off as momentum so disk-exit flows
           * seamlessly into the fluid instead of stopping dead. */
          velX[i] = px - prevX
          velY[i] = py - prevY
        } else {
          let vx = velX[i]!
          let vy = velY[i]!
          let fmagL1 = 0
          if (fieldLive) {
            sampleVelocityField(
              field,
              px + fieldHalfW,
              py + fieldHalfH,
              fieldSampleOut
            )
            const fvx = fieldSampleOut[0]
            const fvy = fieldSampleOut[1]
            fmagL1 = Math.abs(fvx) + Math.abs(fvy)
            vx += fvx * fieldRide
            vy += fvy * fieldRide
          }
          const ddx = hx - px
          const ddy = hy - py
          /** Quiet + home + slow → snap and zero out. Keeps the resting
           * wordmark pixel-crisp instead of hovering a fraction off home
           * under the (deliberately soft) spring. */
          if (
            fmagL1 < 0.05 &&
            vx < 0.05 && vx > -0.05 &&
            vy < 0.05 && vy > -0.05 &&
            ddx < 0.5 && ddx > -0.5 &&
            ddy < 0.5 && ddy > -0.5
          ) {
            positions[i3] = hx
            positions[i3 + 1] = hy
            velX[i] = 0
            velY[i] = 0
            wasInDisk[i] = 0
            continue
          }
          const springK = fmagL1 > fieldActivation ? springEnergized : springBase
          vx += ddx * springK
          vy += ddy * springK
          vx *= frictionFactor
          vy *= frictionFactor
          const spSq = vx * vx + vy * vy
          if (spSq > velCapSq) {
            const s = FIELD_VEL_CAP / Math.sqrt(spSq)
            vx *= s
            vy *= s
          }
          px += vx * dtF
          py += vy * dtF
          velX[i] = vx
          velY[i] = vy
        }
        wasInDisk[i] = inDisk ? 1 : 0
        positions[i3] = px
        positions[i3 + 1] = py
        continue
      }

      if (inDisk) {
        /** Capture overrides settle — a re-grabbed particle is live again. */
        settleUntil[i] = 0
      } else if (settleUntil[i]! > nowTick) {
        /** SETTLE — post-wake meander. The home target wobbles on a
         * per-particle Lissajous (two incommensurate frequencies, phases
         * from the hash) whose amplitude decays linearly over settleMs,
         * so released particles wander back instead of converging in
         * straight lines. */
        const remain = (settleUntil[i]! - nowTick) / Math.max(1, settleMs)
        const h = trailHash[i]!
        const ph1 = ((h & 0xffff) / 0xffff) * Math.PI * 2
        const ph2 = (((h >>> 10) & 0xffff) / 0xffff) * Math.PI * 2
        const wob = settleWobbleAmp * remain
        const tSec = nowTick * 0.001
        targetX += Math.sin(tSec * 2.6 + ph1) * wob
        targetY += Math.cos(tSec * 2.1 + ph2) * wob
      }

      const alpha = inDisk ? inAlpha : outAlpha
      px += (targetX - px) * alpha
      py += (targetY - py) * alpha

      /** Edge detect: every particle that was in the disk and exits enters
       * wake playback (trailingProbability defaults to 1). */
      if (haveCursor && wasInDisk[i] === 1 && !inDisk) {
        const h = trailHash[i]!
        const rollHash =
          (h ^ ((Math.floor(nowTick * 0.013) | 0) * 2654435761)) >>> 0
        const roll = (rollHash & 0xffffff) / 0xffffff
        if (roll < trailingProbability) {
          trailUntil[i] = nowTick + trailFollowMs
          releaseTime[i] = nowTick
          trailOffX[i] = px - mx
          trailOffY[i] = py - my
        }
      }
      wasInDisk[i] = inDisk ? 1 : 0

      positions[i3] = px
      positions[i3 + 1] = py
    }
    geometry.attributes.position!.needsUpdate = true
    if (debugOn === 1) {
      /** Only push aTrail to the GPU when debug is on — otherwise it has
       * no visual effect and the upload is pure waste. */
      geometry.attributes.aTrail!.needsUpdate = true
    }
  })

  /** Auto-fit camera — contain keeps full image visible; cover fills viewport edge-to-edge. */
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    if (cam.isPerspectiveCamera == null) return
    const fitMargin = logoFit === "cover" ? 1.0 : 0.85
    const vFov = (cam.fov * Math.PI) / 180
    const tanHalfFov = Math.tan(vFov / 2)
    const distForHeight = height / fitMargin / (2 * tanHalfFov)
    const distForWidth = width / fitMargin / (2 * tanHalfFov * cam.aspect)
    const dist = logoFit === "cover"
      ? Math.min(distForHeight, distForWidth)
      : Math.max(distForHeight, distForWidth)
    cam.position.set(0, 0, dist)
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
  }, [width, height, size.width, size.height, camera, logoFit])

  return (
    <>
      <points ref={pointsRef} geometry={geometry} material={material} />
      <DebugCursorHistory
        cursorHistory={cursorHistory}
        smoothedCursor={smoothedCursor}
        tuningRef={tuningRef}
      />
      <DebugFieldGrid
        field={state.field}
        fieldHalfW={state.fieldHalfW}
        fieldHalfH={state.fieldHalfH}
        tuningRef={tuningRef}
      />
    </>
  )
}

/** Velocity-grid visualizer — one line segment per non-silent cell, drawn
 * from the cell centre along its velocity vector (×4 so direction reads at
 * a glance). Only renders when BOTH the debug overlay and field mode are
 * on; draw range collapses to zero otherwise so the idle cost is nil.
 * This is the ground-truth view of the fluid: if a stroke deposits energy
 * you SEE cyan vectors paint along the path, watch advection carry them,
 * projection curl them, and decay eat them. If you see nothing here, the
 * deposit chain is broken — no amount of particle-knob tuning will help. */
function DebugFieldGrid({
  field,
  fieldHalfW,
  fieldHalfH,
  tuningRef,
}: {
  field: VelocityField
  fieldHalfW: number
  fieldHalfH: number
  tuningRef: React.MutableRefObject<ThreeTuning>
}) {
  const cellCount = field.cols * field.rows
  const positions = useMemo(
    () => new Float32Array(cellCount * 6),
    [cellCount]
  )
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    g.setDrawRange(0, 0)
    return g
  }, [positions])
  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0x2bffd0,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
        depthWrite: false,
      }),
    []
  )
  const lineObject = useMemo(
    () => new THREE.LineSegments(geo, mat),
    [geo, mat]
  )

  useFrame(() => {
    const nm = tuningRef.current
    if (!nm.debugOverlay || !nm.fieldMode) {
      geo.setDrawRange(0, 0)
      return
    }
    const { cols, rows, cellW, cellH, vx, vy } = field
    let seg = 0
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i
        const u = vx[idx]!
        const v = vy[idx]!
        if (u * u + v * v < 0.04) continue
        const cx = (i + 0.5) * cellW - fieldHalfW
        const cy = (j + 0.5) * cellH - fieldHalfH
        const o = seg * 6
        positions[o] = cx
        positions[o + 1] = cy
        positions[o + 2] = 0.3
        positions[o + 3] = cx + u * 4
        positions[o + 4] = cy + v * 4
        positions[o + 5] = 0.3
        seg++
      }
    }
    geo.setDrawRange(0, seg * 2)
    geo.attributes.position!.needsUpdate = true
  })

  return <primitive object={lineObject} frustumCulled={false} />
}

/** Cursor-history visualizer. Draws a polyline along the recorded cursor
 * samples (newest = bright magenta head, fading to dim toward the tail)
 * and a crosshair at the smoothed cursor position. Only mounted into
 * the scene when `debugOverlay` is on, so the overhead is zero in the
 * default release build.
 *
 * This is a diagnostic — it lets the user see EXACTLY what the wake
 * playback has to work with: if the polyline is empty or only a single
 * point, there is no history for particles to follow.
 */
function DebugCursorHistory({
  cursorHistory,
  smoothedCursor,
  tuningRef,
}: {
  cursorHistory: React.MutableRefObject<CursorSample[]>
  smoothedCursor: React.MutableRefObject<{ x: number; y: number } | null>
  tuningRef: React.MutableRefObject<ThreeTuning>
}) {
  /** Pre-allocate max line capacity. 1024 samples × ~16ms ≈ 16s buffer,
   * comfortably more than any sensible `trailFollowMs`. */
  const MAX = 1024
  const positions = useMemo(() => new Float32Array(MAX * 3), [])

  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    g.setDrawRange(0, 0)
    return g
  }, [positions])

  const lineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0xff44ff,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
      }),
    []
  )

  /** Build the THREE.Line object once and render via `<primitive>`. The
   * lowercase `<line>` JSX element collides with SVG's `<line>` in TS. */
  const lineObject = useMemo(
    () => new THREE.Line(lineGeo, lineMat),
    [lineGeo, lineMat]
  )

  const markerGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(3), 3)
    )
    return g
  }, [])

  const markerMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: 0xffff00,
        size: 14,
        sizeAttenuation: false,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    []
  )

  useFrame(() => {
    const debug = tuningRef.current.debugOverlay
    if (!debug) {
      lineGeo.setDrawRange(0, 0)
      markerMat.opacity = 0
      return
    }
    const hist = cursorHistory.current
    const n = Math.min(hist.length, MAX)
    /** Copy samples newest-on-the-end into the position buffer. We slice
     * from the tail so the line always shows the most recent window. */
    const start = hist.length - n
    for (let i = 0; i < n; i++) {
      const s = hist[start + i]!
      positions[i * 3] = s.x
      positions[i * 3 + 1] = s.y
      positions[i * 3 + 2] = 0.1
    }
    lineGeo.setDrawRange(0, n)
    lineGeo.attributes.position!.needsUpdate = true

    const sm = smoothedCursor.current
    const m = markerGeo.attributes.position! as THREE.BufferAttribute
    if (sm != null) {
      const arr = m.array as Float32Array
      arr[0] = sm.x
      arr[1] = sm.y
      arr[2] = 0.2
      m.needsUpdate = true
      markerMat.opacity = 1
    } else {
      markerMat.opacity = 0
    }
  })

  /** Always mounted — when debug is off the draw range is 0 and marker
   * opacity is 0, so the GPU cost is negligible. This lets the component
   * react to tuning toggles without remount. */
  return (
    <>
      <primitive object={lineObject} frustumCulled={false} />
      <points
        geometry={markerGeo}
        material={markerMat}
        frustumCulled={false}
      />
    </>
  )
}

/** 4Hz readout of the sim loop's field stats. Numbers, not vibes: max cell
 * magnitude tells you whether strokes deposit energy at all, active% tells
 * you how much of the grid exceeds the activation threshold (i.e. how much
 * of the wordmark the fluid can grab), and the stroke age confirms the
 * deposit path is seeing your mouse. */
function FieldStatsReadout({ activation }: { activation: number }) {
  const [stats, setStats] = useState({
    maxL1: 0,
    activePct: 0,
    msSinceDeposit: -1,
  })
  useEffect(() => {
    const iv = window.setInterval(() => {
      setStats({ ...FIELD_DEBUG_STATS })
    }, 250)
    return () => window.clearInterval(iv)
  }, [])
  return (
    <div className="mt-1 font-mono text-[11px] text-cyan-300">
      field max {stats.maxL1.toFixed(1)} · above activation ({activation.toFixed(1)}):{" "}
      {stats.activePct.toFixed(1)}% · last stroke{" "}
      {stats.msSinceDeposit < 0
        ? "never"
        : `${(stats.msSinceDeposit / 1000).toFixed(1)}s ago`}
    </div>
  )
}

type Props = {
  logoSrc?: string
  particleCount?: number
  logoFit?: "contain" | "cover"
  /** When true, sample each particle's colour directly from the source image
   * instead of using the gradient. Ideal for photos. */
  useImageColors?: boolean
  /** Hide the tuner panel + particle-count caption — for customer-facing
   * embeds (e.g. the lookbook sphere's pole overlay) where dev chrome
   * doesn't belong. Tuning still loads from storage/defaults. */
  hideChrome?: boolean
  /** Override the container height class (default: h-screen for cover,
   * h-[80vh] for contain). Pass "h-full" to fill an embedding flex parent. */
  heightClassName?: string
  /** Override the gradient painted across the wordmark (left → right
   * stops, 0-255 RGB). Defaults to the lab rainbow. The lookbook sphere
   * passes a different palette per pole. */
  gradientStops?: GradientStops
}

export default function HomeParticleThree({
  logoSrc = "/branding/sc-prints-logo-transparent.png",
  logoFit = "contain",
  useImageColors = false,
  hideChrome = false,
  heightClassName,
  gradientStops,
}: Props) {
  const [stipple, setStipple] = useState<{
    points: StipplePoint[]
    width: number
    height: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tuning, setTuning] = useState<ThreeTuning>(() => loadStoredTuning())
  const tuningRef = useRef<ThreeTuning>(tuning)
  useEffect(() => {
    tuningRef.current = tuning
  }, [tuning])

  useEffect(() => {
    let cancelled = false
    sampleWordmarkStipple(logoSrc, 1024, 128, useImageColors)
      .then((result) => {
        if (cancelled) return
        setStipple(result)
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [logoSrc])

  if (error != null) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center text-ui-fg-error">
        <p>Failed to sample wordmark: {error}</p>
      </div>
    )
  }

  return (
    <div
      className={`relative w-full bg-black ${
        heightClassName ?? (logoFit === "cover" ? "h-screen" : "h-[80vh]")
      }`}
    >
      <Canvas
        camera={{ position: [0, 0, 1000], fov: 35, near: 1, far: 5000 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          {stipple != null && (
            <ParticleField
              stipple={stipple.points}
              width={stipple.width}
              height={stipple.height}
              particleCount={tuning.particleCount}
              tuningRef={tuningRef}
              logoFit={logoFit}
              useImageColors={useImageColors}
              gradientStops={gradientStops}
            />
          )}
        </Suspense>
      </Canvas>
      {!hideChrome && (
        <>
          <ThreeTunerPanel tuning={tuning} onChange={setTuning} />
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-center text-xs text-ui-fg-subtle">
            Three.js Points · {tuning.particleCount.toLocaleString()} particles
            {tuning.debugOverlay && tuning.fieldMode ? (
              <FieldStatsReadout activation={tuning.fieldActivation} />
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
