"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"

import { sampleWordmarkStipple, type StipplePoint } from "@modules/home/components/home-particle-three/sample-wordmark"

/**
 * BlockGridHero — a perspective grid of rounded pastel blocks converging on a
 * glowing centre, where the SC Prints logo is voxelised out of the same blocks.
 *
 * Concept: blocks sit on a shallow "bowl" (centre pushed far in Z, edges near),
 * so a straight-on perspective camera makes them radiate from a central
 * vanishing point — small + bright at the centre, larger toward the frame
 * edges (exactly the reference image). Each block bobs vertically on a sine
 * wave whose phase depends on its distance from centre → a calm ripple breathing
 * out from the middle. The logo blocks live at the convergence point in the same
 * block style, but hold a brand colour, run brighter, and bob less so the mark
 * stays legible while the field ripples.
 *
 * Rendering: two THREE.InstancedMesh (field + logo) of camera-facing rounded
 * quads (a canvas-made rounded-rect texture, alphaTest cutout so depth occludes
 * correctly in one draw call). The bob is CPU-side over ~3k instances (cheap,
 * mobile-fine, and debuggable — no custom shader to go blank on us). Pauses
 * offscreen (frameloop="never") and renders a single static frame for
 * prefers-reduced-motion. Three.js + react-three-fiber, dynamic-imported ssr:false.
 */

// ─── Tuning ───────────────────────────────────────────────────────────────────
const TUNING = {
  cols: 46,
  rows: 30,
  fieldHalfW: 8.4, // world half-width the grid spans
  fieldHalfH: 5.4,
  depth: 10, // how far the centre is pushed back (Z). Bigger = deeper tunnel.
  blockSize: 0.34, // world size of a field block (perspective shrinks far ones)
  cornerGapMin: 0.0, // (reserved) — keep blocks touching-ish

  // Bob — CALM & HYPNOTIC: small amplitude, slow speed, ripple from centre.
  bobAmplitude: 0.16, // world units of vertical travel
  bobSpeed: 0.7, // radians/sec
  bobRippleScale: 1.7, // how tight the spatial ripple is (phase per unit radius)

  // Logo (voxelised full wordmark) seated at the vanishing point.
  logoSampleCols: 62, // voxel resolution — higher keeps "PRINTS" legible
  logoWorldW: 6.2, // world width the logo mosaic spans
  logoZ: -5.2, // depth of the logo plane (in front of the far centre)
  logoBlockSize: 0.092, // small blocks → fine, legible wordmark
  logoBobFactor: 0.35, // logo bobs less than the field
  logoBrightness: 1.32, // logo blocks run brighter

  camZ: 7.4,
  fov: 55,
  bg: "#0c0b1a", // deep brand-navy backdrop
} as const

// ─── Brand-tilted candy palette ───────────────────────────────────────────────
// Teal + magenta are the brand anchors (weighted heavier); soft lavender /
// yellow / cyan are candy accents. Kept to a small set so it reads cohesive,
// not rainbow-chaotic.
const PALETTE: { hex: string; weight: number }[] = [
  { hex: "#3dcfc2", weight: 3 }, // brand teal
  { hex: "#ff4d7d", weight: 3 }, // brand magenta (softened toward candy)
  { hex: "#b9a7ff", weight: 2 }, // lavender
  { hex: "#ffe46b", weight: 2 }, // warm yellow
  { hex: "#7fe7e0", weight: 2 }, // pale cyan
  { hex: "#9b7bff", weight: 1 }, // violet
]
// Logo anchor colours — brand teal + magenta, kept punchy.
const LOGO_COLORS = ["#3dcfc2", "#ff2e63", "#ffffff"]

function buildWeightedColors(): THREE.Color[] {
  const out: THREE.Color[] = []
  for (const p of PALETTE) for (let i = 0; i < p.weight; i++) out.push(new THREE.Color(p.hex))
  return out
}

// Deterministic pseudo-random so colours/phases are stable across renders.
function hash2(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}

// ─── Rounded-rect tile texture (white + soft vertical shading) ─────────────────
function makeRoundedTexture(): THREE.Texture {
  const S = 128
  const c = document.createElement("canvas")
  c.width = S
  c.height = S
  const ctx = c.getContext("2d")!
  ctx.clearRect(0, 0, S, S)
  // Subtle top-lit gradient so each tile reads as a soft 3D block, not a flat chip.
  const g = ctx.createLinearGradient(0, 0, 0, S)
  g.addColorStop(0, "rgba(255,255,255,1)")
  g.addColorStop(0.55, "rgba(238,238,245,1)")
  g.addColorStop(1, "rgba(205,205,220,1)")
  ctx.fillStyle = g
  const r = S * 0.26 // corner radius
  const pad = S * 0.06
  const x = pad
  const y = pad
  const w = S - pad * 2
  const h = S - pad * 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

// Soft radial glow for the convergence point.
function makeGlowTexture(): THREE.Texture {
  const S = 256
  const c = document.createElement("canvas")
  c.width = S
  c.height = S
  const ctx = c.getContext("2d")!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, "rgba(255,255,255,0.9)")
  g.addColorStop(0.25, "rgba(180,255,245,0.5)")
  g.addColorStop(0.6, "rgba(120,150,255,0.16)")
  g.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ─── Field + logo instanced blocks ─────────────────────────────────────────────
type BlockData = {
  position: THREE.Vector3
  baseY: number
  phase: number
  color: THREE.Color
  size: number
  bobFactor: number
}

function FieldAndLogo({
  stipple,
  reducedMotion,
}: {
  stipple: { points: StipplePoint[]; width: number; height: number } | null
  reducedMotion: boolean
}) {
  const fieldRef = useRef<THREE.InstancedMesh>(null)
  const logoRef = useRef<THREE.InstancedMesh>(null)
  const tex = useMemo(() => makeRoundedTexture(), [])
  const glowTex = useMemo(() => makeGlowTexture(), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  // Field blocks — a Z-bowl grid radiating from centre.
  const field = useMemo<BlockData[]>(() => {
    const colors = buildWeightedColors()
    const out: BlockData[] = []
    const { cols, rows, fieldHalfW, fieldHalfH, depth, blockSize, bobRippleScale } = TUNING
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const u = cols > 1 ? (i / (cols - 1)) * 2 - 1 : 0 // -1..1
        const v = rows > 1 ? (j / (rows - 1)) * 2 - 1 : 0
        const r = Math.min(1, Math.hypot(u, v))
        const x = u * fieldHalfW
        const y = v * fieldHalfH
        const z = -depth * (1 - r) // centre far, edges near
        const h = hash2(i, j)
        const base = colors[Math.floor(h * colors.length) % colors.length].clone()
        // Brighten toward the centre (the focal glow) for the reference's hot core.
        base.lerp(new THREE.Color("#ffffff"), (1 - r) * 0.45)
        out.push({
          position: new THREE.Vector3(x, y, z),
          baseY: y,
          phase: r * bobRippleScale * Math.PI * 2 + h * 0.6,
          color: base,
          size: blockSize,
          bobFactor: 1,
        })
      }
    }
    return out
  }, [])

  // Logo blocks — voxelised wordmark seated at the vanishing point.
  const logo = useMemo<BlockData[]>(() => {
    if (!stipple) return []
    const { logoWorldW, logoZ, logoBlockSize, logoBobFactor, logoBrightness, bobRippleScale } = TUNING
    const aspect = stipple.width / stipple.height
    const logoWorldH = logoWorldW / aspect
    const cols = LOGO_COLORS.map((c) => new THREE.Color(c))
    const out: BlockData[] = []
    for (const p of stipple.points) {
      const x = (p.u - 0.5) * logoWorldW
      const y = (0.5 - p.v) * logoWorldH // flip: image v grows downward
      const h = hash2(Math.round(p.x), Math.round(p.y))
      const col = cols[Math.floor(h * cols.length) % cols.length].clone()
      col.multiplyScalar(logoBrightness)
      out.push({
        position: new THREE.Vector3(x, y, logoZ),
        baseY: y,
        phase: Math.hypot(x, y) * bobRippleScale + h,
        color: col,
        size: logoBlockSize,
        bobFactor: logoBobFactor,
      })
    }
    return out
  }, [stipple])

  // Push initial matrices + colours into both instanced meshes.
  useEffect(() => {
    for (const [ref, data] of [
      [fieldRef, field],
      [logoRef, logo],
    ] as const) {
      const mesh = ref.current
      if (!mesh || data.length === 0) continue
      for (let i = 0; i < data.length; i++) {
        const b = data[i]
        dummy.position.copy(b.position)
        dummy.scale.setScalar(b.size)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        mesh.setColorAt(i, b.color)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [field, logo, dummy])

  // Per-frame bob. Skipped entirely under reduced motion (static frame above).
  useFrame((state) => {
    if (reducedMotion) return
    const t = state.clock.getElapsedTime() * TUNING.bobSpeed
    for (const [ref, data] of [
      [fieldRef, field],
      [logoRef, logo],
    ] as const) {
      const mesh = ref.current
      if (!mesh || data.length === 0) continue
      for (let i = 0; i < data.length; i++) {
        const b = data[i]
        const dy = Math.sin(t + b.phase) * TUNING.bobAmplitude * b.bobFactor
        dummy.position.set(b.position.x, b.baseY + dy, b.position.z)
        dummy.scale.setScalar(b.size)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {/* Convergence glow behind the logo */}
      <mesh position={[0, 0, TUNING.logoZ - 0.4]} renderOrder={-1}>
        <planeGeometry args={[7, 7]} />
        <meshBasicMaterial
          map={glowTex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <instancedMesh ref={fieldRef} args={[undefined, undefined, field.length]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={tex}
          alphaTest={0.5}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      {logo.length > 0 && (
        <instancedMesh ref={logoRef} args={[undefined, undefined, logo.length]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={tex}
            alphaTest={0.5}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </instancedMesh>
      )}
    </>
  )
}

// Keep the camera looking dead-on at the convergence point.
function Rig() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(0, 0, TUNING.camZ)
    camera.lookAt(0, 0, -TUNING.depth)
  }, [camera])
  return null
}

type Props = { className?: string; style?: React.CSSProperties }

export default function BlockGridHero({ className, style }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [stipple, setStipple] = useState<{
    points: StipplePoint[]
    width: number
    height: number
  } | null>(null)
  const [inView, setInView] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)

  // Voxelise the full wordmark at a coarse resolution (each opaque pixel = one
  // logo block). Higher logoSampleCols keeps "PRINTS" legible.
  useEffect(() => {
    let cancelled = false
    sampleWordmarkStipple(
      "/branding/sc-prints-logo-transparent.png",
      TUNING.logoSampleCols,
      90,
      false
    )
      .then((res) => {
        if (!cancelled) setStipple(res)
      })
      .catch(() => {
        /* logo is optional — field still renders */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    try {
      setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    } catch {
      /* noop */
    }
  }, [])

  // Pause the render loop when the hero scrolls offscreen.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const frameloop = !inView ? "never" : reducedMotion ? "demand" : "always"

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
        background: TUNING.bg,
        ...style,
      }}
    >
      <Canvas
        frameloop={frameloop}
        camera={{ position: [0, 0, TUNING.camZ], fov: TUNING.fov, near: 0.1, far: 100 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
        style={{ position: "absolute", inset: 0 }}
      >
        <color attach="background" args={[TUNING.bg]} />
        <Rig />
        <FieldAndLogo stipple={stipple} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}
