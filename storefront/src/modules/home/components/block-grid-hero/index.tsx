"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"

/**
 * BlockGridHero — a perspective grid of rounded pastel blocks converging on a
 * glowing centre, with the flat SC Prints wordmark seated over the convergence
 * point.
 *
 * Concept: blocks sit on a shallow "bowl" (centre pushed far in Z, edges near),
 * so a straight-on perspective camera makes them radiate from a central
 * vanishing point — small + bright at the centre, larger toward the frame
 * edges (exactly the reference image). Each block bobs vertically on a sine
 * wave whose phase depends on its distance from centre → a calm ripple breathing
 * out from the middle. The brand wordmark is rendered as a flat black image
 * overlay at the centre (replacing the earlier voxelised-block wordmark).
 *
 * Rendering: one THREE.InstancedMesh of camera-facing rounded quads (a
 * canvas-made rounded-rect texture, alphaTest cutout so depth occludes
 * correctly in one draw call). The bob is CPU-side over ~1.4k instances (cheap,
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

  // Flat wordmark seated at the vanishing point.
  logoZ: -5.2, // (reference) depth the wordmark sits over

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

// ─── Field instanced blocks ────────────────────────────────────────────────────
type BlockData = {
  position: THREE.Vector3
  baseY: number
  phase: number
  color: THREE.Color
  size: number
  bobFactor: number
}

function Field({ reducedMotion }: { reducedMotion: boolean }) {
  const fieldRef = useRef<THREE.InstancedMesh>(null)
  const tex = useMemo(() => makeRoundedTexture(), [])
  const glowTex = useMemo(() => makeGlowTexture(), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  // Explicit geometry + material passed via args (the pattern that mounts
  // reliably in r3f v9 — the undefined-args + child-geometry form rendered blank).
  const blockGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const blockMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: tex,
        alphaTest: 0.5,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [tex]
  )

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

  // Push initial matrices + colours into the instanced mesh.
  useEffect(() => {
    const mesh = fieldRef.current
    if (!mesh || field.length === 0) return
    for (let i = 0; i < field.length; i++) {
      const b = field[i]
      dummy.position.copy(b.position)
      dummy.scale.setScalar(b.size)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, b.color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [field, dummy])

  // Per-frame bob. Skipped entirely under reduced motion (static frame above).
  useFrame((state) => {
    if (reducedMotion) return
    const t = state.clock.getElapsedTime() * TUNING.bobSpeed
    const mesh = fieldRef.current
    if (!mesh || field.length === 0) return
    for (let i = 0; i < field.length; i++) {
      const b = field[i]
      const dy = Math.sin(t + b.phase) * TUNING.bobAmplitude * b.bobFactor
      dummy.position.set(b.position.x, b.baseY + dy, b.position.z)
      dummy.scale.setScalar(b.size)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      {/* Convergence glow behind the wordmark */}
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

      <instancedMesh ref={fieldRef} args={[blockGeometry, blockMaterial, field.length]} />
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
  const [inView, setInView] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)

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
        <Field reducedMotion={reducedMotion} />
      </Canvas>

      {/* Flat SC Prints wordmark over the convergence point (black, per brand
          wordmark). The source PNG is the black graffiti wordmark on transparent
          — rendered as-is (no invert). pointer-events-none so the hero CTAs
          underneath/over it stay clickable. */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/sc-prints-logo-transparent.png"
          alt="SC Prints"
          className="w-[clamp(180px,28vw,360px)] h-auto select-none"
          draggable={false}
        />
      </div>
    </div>
  )
}
