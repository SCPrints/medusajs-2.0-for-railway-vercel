"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import {
  sampleWordmarkStipple,
  type StipplePoint,
} from "@modules/home/components/home-particle-three/sample-wordmark"

/**
 * BlockCityHero — variant 3. A "city of blocks seen from above": the same
 * radial/perspective convergence as the reference image, but each tile is a
 * real extruded rounded BOX with visible side walls. Blocks rise up toward the
 * viewer and sink back on a calm radial ripple — as a block approaches the
 * camera its walls read longer (perspective), like buildings breathing. The
 * wordmark is laid crisply over the top (composited in the route, not voxelised).
 *
 * vs. block-grid-hero (variant 2): that one is flat camera-facing tiles; this
 * one is lit 3D boxes (directional + ambient light so the walls shade), so it
 * reads as a cityscape rather than a mosaic.
 *
 * Rendering: one InstancedMesh of RoundedBoxGeometry, per-instance colour +
 * per-instance depth (varied "building heights"), bobbed CPU-side over ~1k
 * instances. Pauses offscreen, static frame for reduced-motion. Three.js + r3f.
 */

// ─── Tuning ───────────────────────────────────────────────────────────────────
const TUNING = {
  cols: 40,
  rows: 26,
  fieldHalfW: 8.4,
  fieldHalfH: 5.4,
  depth: 10, // centre pushed back in Z → radial convergence to a central point
  blockFace: 0.52, // square front-face size of each block
  boxDepthMin: 0.45, // wall length range → varied "building heights"
  boxDepthMax: 1.5,

  // Motion — blocks rise toward the viewer (+Z) and back, calm radial ripple.
  bobAmplitude: 0.6, // world units along the view axis
  bobSpeed: 0.8, // radians/sec
  bobRippleScale: 1.8, // phase per unit radius → wave breathing out from centre

  // Voxelised wordmark — built from the SAME blocks, but raised toward the
  // viewer, taller, glowing and steadier so it stands out from the rippling
  // field and reads as the logo rather than an overlay.
  logoSampleCols: 30, // voxel resolution (chunky; bold SC reads, PRINTS stylised)
  logoWorldW: 4.0, // world width of the mosaic (sized so the near-square logo fits the frame)
  logoZ: 1.6, // raised toward the camera (field centre sits far at -depth)
  logoBlockScale: 1.45, // block face = grid pitch × this → slight overlap = chunky/connected
  logoDepth: 1.25, // tall towers so the logo reads as raised
  logoBobAmplitude: 0.1, // much steadier than the field's 0.6

  camZ: 7.4,
  fov: 55,
  bg: "#0c0b1a",
} as const

// Brand-tilted candy palette (teal + magenta anchors, candy accents).
const PALETTE: { hex: string; weight: number }[] = [
  { hex: "#3dcfc2", weight: 3 },
  { hex: "#ff4d7d", weight: 3 },
  { hex: "#b9a7ff", weight: 2 },
  { hex: "#ffe46b", weight: 2 },
  { hex: "#7fe7e0", weight: 2 },
  { hex: "#9b7bff", weight: 1 },
]

function buildWeightedColors(): THREE.Color[] {
  const out: THREE.Color[] = []
  for (const p of PALETTE) for (let i = 0; i < p.weight; i++) out.push(new THREE.Color(p.hex))
  return out
}

function hash2(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function makeGlowTexture(): THREE.Texture {
  const S = 256
  const c = document.createElement("canvas")
  c.width = S
  c.height = S
  const ctx = c.getContext("2d")!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, "rgba(255,255,255,0.85)")
  g.addColorStop(0.25, "rgba(180,255,245,0.45)")
  g.addColorStop(0.6, "rgba(120,150,255,0.14)")
  g.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

type Block = {
  x: number
  y: number
  baseZ: number
  depth: number
  phase: number
  color: THREE.Color
}

function CityBlocks({
  reducedMotion,
  stipple,
}: {
  reducedMotion: boolean
  stipple: { points: StipplePoint[]; width: number; height: number } | null
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const logoRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const glowTex = useMemo(() => makeGlowTexture(), [])

  const geometry = useMemo(
    () => new RoundedBoxGeometry(1, 1, 1, 3, 0.18),
    []
  )
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.62,
        metalness: 0.0,
        toneMapped: false, // keep the candy colours vivid
      }),
    []
  )
  // Logo blocks glow (emissive) so they pop out of the colourful field.
  const logoMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        emissive: new THREE.Color("#bff3ec"), // faint brand-teal glow
        emissiveIntensity: 0.6,
        roughness: 0.36,
        metalness: 0.0,
        toneMapped: false,
      }),
    []
  )

  const blocks = useMemo<Block[]>(() => {
    const colors = buildWeightedColors()
    const out: Block[] = []
    const { cols, rows, fieldHalfW, fieldHalfH, depth, boxDepthMin, boxDepthMax, bobRippleScale } =
      TUNING
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const u = cols > 1 ? (i / (cols - 1)) * 2 - 1 : 0
        const v = rows > 1 ? (j / (rows - 1)) * 2 - 1 : 0
        const r = Math.min(1, Math.hypot(u, v))
        const h = hash2(i, j)
        const h2 = hash2(i * 2.3 + 1, j * 1.7 + 5)
        const boxDepth = boxDepthMin + h2 * (boxDepthMax - boxDepthMin)
        const bowlZ = -depth * (1 - r) // centre far, edges near
        const base = colors[Math.floor(h * colors.length) % colors.length].clone()
        base.lerp(new THREE.Color("#ffffff"), (1 - r) * 0.4) // hotter toward centre
        out.push({
          x: u * fieldHalfW,
          y: v * fieldHalfH,
          baseZ: bowlZ + boxDepth / 2, // extrude toward the camera from the bowl
          depth: boxDepth,
          phase: r * bobRippleScale * Math.PI * 2 + h * 0.7,
          color: base,
        })
      }
    }
    return out
  }, [])

  // Voxelised wordmark — each opaque source pixel becomes a logo block, mapped
  // onto a centred plane raised toward the camera (block face slightly larger
  // than the grid pitch → chunky, connected letterforms).
  const logo = useMemo(() => {
    const empty = { points: [] as { x: number; y: number; baseZ: number; phase: number }[], face: 0.2 }
    if (!stipple || stipple.points.length === 0) return empty
    const aspect = stipple.width / stipple.height
    const worldH = TUNING.logoWorldW / aspect
    const pitch = TUNING.logoWorldW / stipple.width
    const face = pitch * TUNING.logoBlockScale
    const baseZ = TUNING.logoZ + TUNING.logoDepth / 2
    const points = stipple.points.map((p) => ({
      x: (p.u - 0.5) * TUNING.logoWorldW,
      y: (0.5 - p.v) * worldH, // image v grows downward
      baseZ,
      phase: (Math.abs(p.u - 0.5) + Math.abs(p.v - 0.5)) * 3.0,
    }))
    return { points, face }
  }, [stipple])

  // Initial matrices + colours (field).
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      dummy.position.set(b.x, b.y, b.baseZ)
      dummy.scale.set(TUNING.blockFace, TUNING.blockFace, b.depth)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, b.color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [blocks, dummy])

  // Initial matrices (logo).
  useEffect(() => {
    const mesh = logoRef.current
    if (!mesh || logo.points.length === 0) return
    for (let i = 0; i < logo.points.length; i++) {
      const b = logo.points[i]
      dummy.position.set(b.x, b.y, b.baseZ)
      dummy.scale.set(logo.face, logo.face, TUNING.logoDepth)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [logo, dummy])

  useFrame((state) => {
    if (reducedMotion) return
    const t = state.clock.getElapsedTime() * TUNING.bobSpeed

    const mesh = meshRef.current
    if (mesh) {
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]
        const dz = Math.sin(t + b.phase) * TUNING.bobAmplitude
        dummy.position.set(b.x, b.y, b.baseZ + dz)
        dummy.scale.set(TUNING.blockFace, TUNING.blockFace, b.depth)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }

    // Logo bobs gently + slower so it reads as anchored vs. the rippling field.
    const lm = logoRef.current
    if (lm && logo.points.length > 0) {
      for (let i = 0; i < logo.points.length; i++) {
        const b = logo.points[i]
        const dz = Math.sin(t * 0.8 + b.phase) * TUNING.logoBobAmplitude
        dummy.position.set(b.x, b.y, b.baseZ + dz)
        dummy.scale.set(logo.face, logo.face, TUNING.logoDepth)
        dummy.updateMatrix()
        lm.setMatrixAt(i, dummy.matrix)
      }
      lm.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <ambientLight intensity={0.62} />
      <directionalLight position={[4, 7, 9]} intensity={1.0} />
      <directionalLight position={[-6, -4, 5]} intensity={0.28} color="#9fb4ff" />

      {/* Convergence glow at the far centre */}
      <mesh position={[0, 0, -TUNING.depth + 0.6]} renderOrder={-1}>
        <planeGeometry args={[9, 9]} />
        <meshBasicMaterial
          map={glowTex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <instancedMesh ref={meshRef} args={[geometry, material, blocks.length]} />

      {logo.points.length > 0 && (
        <instancedMesh ref={logoRef} args={[geometry, logoMaterial, logo.points.length]} />
      )}
    </>
  )
}

function Rig() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(0, 0, TUNING.camZ)
    camera.lookAt(0, 0, -TUNING.depth)
  }, [camera])
  return null
}

type Props = { className?: string; style?: React.CSSProperties }

export default function BlockCityHero({ className, style }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [stipple, setStipple] = useState<{
    points: StipplePoint[]
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    try {
      setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    } catch {
      /* noop */
    }
  }, [])

  // Voxelise the wordmark (each opaque pixel → a logo block).
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
        /* logo optional — the city still renders */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
    })
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
        <CityBlocks reducedMotion={reducedMotion} stipple={stipple} />
      </Canvas>
    </div>
  )
}
