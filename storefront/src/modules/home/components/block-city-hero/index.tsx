"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"

/**
 * BlockCityHero — variant 3. A "city of blocks seen from above": a radial Z-bowl
 * grid of extruded rounded blocks that converges to a glowing centre, each block
 * rising toward the viewer and sinking back on a calm ripple.
 *
 * The wordmark is NOT a separate layer — it's the SAME grid. The cells whose
 * (x,y) falls inside the logo shape are pulled FORWARD out of the field: their
 * back stays anchored on the bowl (in the field, at their grid position) and
 * their front reaches a common forward plane, so they read as the city's own
 * blocks rising out toward you to spell the logo, then receding back into the
 * field around them. Logo cells glow and are steadier so the mark stays legible
 * while the rest of the field ripples.
 *
 * Rendering: two InstancedMeshes (field + logo) sharing one grid + block size —
 * field is lit candy colour, logo is emissive. CPU bob over ~2k instances.
 * Pauses offscreen, static frame for reduced-motion. Three.js + r3f.
 */

// ─── Tuning ───────────────────────────────────────────────────────────────────
const TUNING = {
  cols: 60,
  rows: 38,
  fieldHalfW: 8.4,
  fieldHalfH: 5.4,
  depth: 8, // centre pushed back in Z → radial convergence to a central point
  blockFace: 0.36, // > grid pitch (~0.29) so blocks slightly overlap → chunky/connected
  boxDepthMin: 0.4, // field "building heights"
  boxDepthMax: 1.4,

  // Field motion — blocks rise toward the viewer (+Z) and sink, calm ripple.
  bobAmplitude: 0.5,
  bobSpeed: 0.8,
  bobRippleScale: 1.8,

  // Wordmark = a subset of the SAME grid cells, pulled forward out of the field.
  logoBandCols: 30, // grid columns the wordmark spans (size + legibility)
  logoFrontZ: 1.7, // common forward plane the logo towers reach (toward camera)
  logoBobAmplitude: 0.14, // gentle pulse of the front; much steadier than the field
  logoAlphaThreshold: 90,

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
  g.addColorStop(0, "rgba(255,255,255,0.8)")
  g.addColorStop(0.25, "rgba(180,255,245,0.4)")
  g.addColorStop(0.6, "rgba(120,150,255,0.12)")
  g.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

type FieldBlock = { x: number; y: number; baseZ: number; depth: number; phase: number; color: THREE.Color }
type LogoBlock = { x: number; y: number; backZ: number; phase: number }

function CityBlocks({ reducedMotion }: { reducedMotion: boolean }) {
  const fieldRef = useRef<THREE.InstancedMesh>(null)
  const logoRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const glowTex = useMemo(() => makeGlowTexture(), [])
  const [logoMask, setLogoMask] = useState<boolean[] | null>(null)

  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.16), [])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.0, toneMapped: false }),
    []
  )
  // Logo blocks glow so the wordmark reads as it rises out of the field.
  const logoMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        emissive: new THREE.Color("#bff3ec"),
        emissiveIntensity: 0.5,
        roughness: 0.34,
        metalness: 0.0,
        toneMapped: false,
      }),
    []
  )

  // Build a logo membership mask aligned to the grid: draw the wordmark into a
  // centred band of a cols×rows canvas and read each cell's alpha. Canvas row 0
  // is the image top; the grid's j=0 is the screen bottom, so we flip rows when
  // we read the mask in the build loop.
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (cancelled) return
      const { cols, rows, fieldHalfW, fieldHalfH, logoBandCols, logoAlphaThreshold } = TUNING
      const aspect = img.naturalWidth / img.naturalHeight
      const cellW = (2 * fieldHalfW) / cols
      const cellH = (2 * fieldHalfH) / rows
      const bandCols = Math.min(cols, logoBandCols)
      const worldW = bandCols * cellW
      const worldH = worldW / aspect
      const bandRows = Math.min(rows, Math.round(worldH / cellH))
      const x0 = Math.floor((cols - bandCols) / 2)
      const y0 = Math.floor((rows - bandRows) / 2)
      const cv = document.createElement("canvas")
      cv.width = cols
      cv.height = rows
      const ctx = cv.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, cols, rows)
      ctx.drawImage(img, x0, y0, bandCols, bandRows)
      const data = ctx.getImageData(0, 0, cols, rows).data
      const mask = new Array(cols * rows).fill(false)
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (data[(row * cols + col) * 4 + 3] > logoAlphaThreshold) mask[row * cols + col] = true
        }
      }
      setLogoMask(mask)
    }
    img.onerror = () => {
      /* logo optional — the city still renders */
    }
    img.src = "/branding/sc-prints-logo-transparent.png"
    return () => {
      cancelled = true
    }
  }, [])

  // One grid loop, partitioned into field cells (stay on the bowl) and logo
  // cells (same grid position, pulled forward into towers).
  const { field, logo } = useMemo(() => {
    const colors = buildWeightedColors()
    const { cols, rows, fieldHalfW, fieldHalfH, depth, boxDepthMin, boxDepthMax, bobRippleScale } =
      TUNING
    const field: FieldBlock[] = []
    const logo: LogoBlock[] = []
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const u = cols > 1 ? (i / (cols - 1)) * 2 - 1 : 0
        const v = rows > 1 ? (j / (rows - 1)) * 2 - 1 : 0
        const r = Math.min(1, Math.hypot(u, v))
        const x = u * fieldHalfW
        const y = v * fieldHalfH
        const bowlZ = -depth * (1 - r) // centre far, edges near
        const h = hash2(i, j)
        const phase = r * bobRippleScale * Math.PI * 2 + h * 0.7
        const canvasRow = rows - 1 - j // flip: grid bottom (j=0) ↔ image bottom
        const isLogo = logoMask ? logoMask[canvasRow * cols + i] === true : false
        if (isLogo) {
          logo.push({ x, y, backZ: bowlZ, phase })
        } else {
          const h2 = hash2(i * 2.3 + 1, j * 1.7 + 5)
          const boxDepth = boxDepthMin + h2 * (boxDepthMax - boxDepthMin)
          const base = colors[Math.floor(h * colors.length) % colors.length].clone()
          base.lerp(new THREE.Color("#ffffff"), (1 - r) * 0.08) // very gentle centre lift
          field.push({ x, y, baseZ: bowlZ + boxDepth / 2, depth: boxDepth, phase, color: base })
        }
      }
    }
    return { field, logo }
  }, [logoMask])

  // Initial matrices.
  useEffect(() => {
    const mesh = fieldRef.current
    if (mesh) {
      for (let i = 0; i < field.length; i++) {
        const b = field[i]
        dummy.position.set(b.x, b.y, b.baseZ)
        dummy.scale.set(TUNING.blockFace, TUNING.blockFace, b.depth)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        mesh.setColorAt(i, b.color)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    const lm = logoRef.current
    if (lm) {
      for (let i = 0; i < logo.length; i++) {
        const b = logo[i]
        const front = TUNING.logoFrontZ
        const d = Math.max(0.2, front - b.backZ)
        dummy.position.set(b.x, b.y, (front + b.backZ) / 2)
        dummy.scale.set(TUNING.blockFace, TUNING.blockFace, d)
        dummy.updateMatrix()
        lm.setMatrixAt(i, dummy.matrix)
      }
      lm.instanceMatrix.needsUpdate = true
    }
  }, [field, logo, dummy])

  useFrame((state) => {
    if (reducedMotion) return
    const t = state.clock.getElapsedTime() * TUNING.bobSpeed

    const mesh = fieldRef.current
    if (mesh) {
      for (let i = 0; i < field.length; i++) {
        const b = field[i]
        const dz = Math.sin(t + b.phase) * TUNING.bobAmplitude
        dummy.position.set(b.x, b.y, b.baseZ + dz)
        dummy.scale.set(TUNING.blockFace, TUNING.blockFace, b.depth)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }

    // Logo towers: back anchored on the bowl, front gently pulsing on the
    // forward plane — they rise out of the field but stay much steadier.
    const lm = logoRef.current
    if (lm) {
      for (let i = 0; i < logo.length; i++) {
        const b = logo[i]
        const front = TUNING.logoFrontZ + Math.sin(t * 0.8 + b.phase) * TUNING.logoBobAmplitude
        const d = Math.max(0.2, front - b.backZ)
        dummy.position.set(b.x, b.y, (front + b.backZ) / 2)
        dummy.scale.set(TUNING.blockFace, TUNING.blockFace, d)
        dummy.updateMatrix()
        lm.setMatrixAt(i, dummy.matrix)
      }
      lm.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <ambientLight intensity={0.38} />
      <directionalLight position={[4, 7, 9]} intensity={0.5} />
      <directionalLight position={[-6, -4, 5]} intensity={0.18} color="#9fb4ff" />

      {/* Convergence glow at the far centre (dim + small so it doesn't wash the field) */}
      <mesh position={[0, 0, -TUNING.depth + 0.6]} renderOrder={-1}>
        <planeGeometry args={[6, 6]} />
        <meshBasicMaterial
          map={glowTex}
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <instancedMesh ref={fieldRef} args={[geometry, material, Math.max(1, field.length)]} />
      {logo.length > 0 && (
        <instancedMesh ref={logoRef} args={[geometry, logoMaterial, logo.length]} />
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

  useEffect(() => {
    try {
      setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    } catch {
      /* noop */
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
        <CityBlocks reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}
