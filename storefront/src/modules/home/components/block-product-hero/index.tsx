"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { useRouter } from "next/navigation"

/**
 * BlockProductHero — a continuous field of long, soft-cornered candy blocks.
 * At rest it's just the blocks (no images). Hover lifts a block TOWARD the
 * viewer (not up the screen → never leaves the cursor → no bounce) and fades in
 * its product image on a rounded top-cap; move off and it glides back slowly
 * (image fades with it) so a swept mouse leaves a trail. Click opens the product.
 *
 * Form notes from feedback:
 * - Bodies are RoundedBoxGeometry (soft corners, not harsh cubes).
 * - Tiles TOUCH on a square pitch (no overlap) so adjacent walls are back-to-back
 *   (opposite normals) → no z-fighting/flicker — with polygonOffset as insurance.
 * - The image lives on a separate rounded top-cap that only appears on hover, so
 *   it's never on the long side walls.
 *
 * Image caps load via Next's same-origin optimiser (WebGL-safe). Three.js + r3f.
 */

type Product = { thumbnail: string; handle: string; title: string }

const COLS = 16
const ROWS = 11
const FIELD_HALF_W = 9.5
// Square pitch so tiles tile perfectly (no black gaps, no overlap → no z-fight).
const FIELD_HALF_H = (FIELD_HALF_W * ROWS) / COLS
const PITCH = (2 * FIELD_HALF_W) / COLS

const TUNING = {
  depth: 1.2, // nearly flat → uniform block sizes, many visible (not a few huge near ones)
  tileFace: PITCH * 1.05, // slight overlap closes the corner/row gaps (rounded + polygonOffset keep flicker away)
  tileDepth: 2.2, // block length
  cornerRadius: 0.05, // soft corners, but smaller gaps at junctions
  bobAmplitude: 0.05, // tiny ripple
  bobSpeed: 0.55,
  bobRippleScale: 1.5,
  // Hover lift travels ALONG the line to the camera, so off-axis blocks grow in
  // place (move inward) rather than shoving off-frame → no edge cut-off, no bounce.
  liftDist: 2.6,
  upLerp: 0.06, // gentle rise
  downLerp: 0.025, // slow glide back → trailing settle
  capInset: 0.9, // image cap size relative to the face
  capOffset: 0.04, // cap sits just in front of the body's top face
  camY: 5.5, // camera raised → looks DOWN at the field at an angle so you see the
  camZ: 14, //  block tops AND side walls → a lifting block reads as a 3D block rising, not a flat square
  lookY: -0.6,
  lookZ: -2,
  fov: 45,
  bg: "#0c0b1a",
} as const

const PALETTE = ["#3dcfc2", "#ff4d7d", "#b9a7ff", "#ffe46b", "#7fe7e0", "#9b7bff"]

function nextImg(url: string, w = 256): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`
}

// Rounded-rect alpha mask for the image cap (so revealed product images have soft corners too).
function makeRoundedAlpha(): THREE.Texture {
  const S = 128
  const c = document.createElement("canvas")
  c.width = S
  c.height = S
  const ctx = c.getContext("2d")!
  ctx.clearRect(0, 0, S, S)
  ctx.fillStyle = "#ffffff"
  const r = S * 0.16
  const x = 2
  const y = 2
  const w = S - 4
  const h = S - 4
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fill()
  return new THREE.CanvasTexture(c)
}

type Tile = {
  x: number
  y: number
  baseZ: number
  lx: number
  ly: number
  lz: number
  phase: number
  productIndex: number
  colorIndex: number
}

function Tiles({
  products,
  countryCode,
  reducedMotion,
}: {
  products: Product[]
  countryCode: string
  reducedMotion: boolean
}) {
  const router = useRouter()
  const bodyGeom = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 4, TUNING.cornerRadius), [])
  const capGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const roundedAlpha = useMemo(() => makeRoundedAlpha(), [])

  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = []
    let k = 0
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const u = COLS > 1 ? (i / (COLS - 1)) * 2 - 1 : 0
        const v = ROWS > 1 ? (j / (ROWS - 1)) * 2 - 1 : 0
        const r = Math.min(1, Math.hypot(u, v))
        const x = u * FIELD_HALF_W
        const y = v * FIELD_HALF_H
        const baseZ = -TUNING.depth * (1 - r) + TUNING.tileDepth / 2
        // Unit direction from this block toward the camera — the lift travels
        // along this so off-axis blocks grow in place (inward), never off-frame.
        const ld = new THREE.Vector3(0, TUNING.camY, TUNING.camZ).sub(new THREE.Vector3(x, y, baseZ)).normalize()
        out.push({
          x,
          y,
          baseZ,
          lx: ld.x,
          ly: ld.y,
          lz: ld.z,
          phase: r * TUNING.bobRippleScale * Math.PI * 2 + (i * 0.3 + j * 0.7),
          productIndex: products.length ? k % products.length : 0,
          colorIndex: (i * 3 + j * 5) % PALETTE.length,
        })
        k++
      }
    }
    return out
  }, [products])

  // Candy block bodies (lit, soft corners). polygonOffset = z-fight insurance.
  const bodyMaterials = useMemo(
    () =>
      PALETTE.map(
        (hex) =>
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(hex),
            roughness: 0.72,
            metalness: 0,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          })
      ),
    []
  )

  // Per-tile image caps (rounded, transparent; fade in with the lift).
  const capMaterials = useMemo(
    () =>
      tiles.map(
        () =>
          new THREE.MeshBasicMaterial({
            color: new THREE.Color("#ffffff"),
            alphaMap: roundedAlpha,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
          })
      ),
    [tiles, roundedAlpha]
  )

  useEffect(() => {
    const loader = new THREE.TextureLoader()
    const texByProduct: (THREE.Texture | null)[] = products.map(() => null)
    const created: THREE.Texture[] = []
    products.forEach((p, idx) => {
      if (!p.thumbnail) return
      loader.load(
        nextImg(p.thumbnail, 256),
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = 4
          texByProduct[idx] = tex
          created.push(tex)
          // Assign to every cap that shows this product.
          tiles.forEach((tile, k) => {
            if (tile.productIndex === idx) {
              capMaterials[k].map = tex
              capMaterials[k].needsUpdate = true
            }
          })
        },
        undefined,
        () => {}
      )
    })
    return () => {
      created.forEach((t) => t.dispose())
    }
  }, [products, tiles, capMaterials])

  const bodyRefs = useRef<(THREE.Mesh | null)[]>([])
  const capRefs = useRef<(THREE.Mesh | null)[]>([])
  const raise = useMemo(() => new Float32Array(tiles.length), [tiles.length])
  const hoveredRef = useRef(-1)
  const cursorPointerRef = useRef(false)

  useFrame((state) => {
    const t = reducedMotion ? 0 : state.clock.getElapsedTime() * TUNING.bobSpeed
    for (let k = 0; k < tiles.length; k++) {
      const body = bodyRefs.current[k]
      if (!body) continue
      const tile = tiles[k]
      const target = hoveredRef.current === k ? 1 : 0
      const rate = target > raise[k] ? TUNING.upLerp : TUNING.downLerp
      raise[k] += (target - raise[k]) * rate
      const bob = reducedMotion ? 0 : Math.sin(t + tile.phase) * TUNING.bobAmplitude
      const lift = raise[k] * TUNING.liftDist
      // Travel along the line to the camera → grows in place, never off-frame.
      const bx = tile.x + tile.lx * lift
      const by = tile.y + tile.ly * lift
      const bz = tile.baseZ + bob + tile.lz * lift
      body.position.set(bx, by, bz)

      const cap = capRefs.current[k]
      if (cap) {
        cap.position.set(bx, by, bz + TUNING.tileDepth / 2 + TUNING.capOffset)
        const op = Math.min(1, raise[k] * 1.6)
        ;(cap.material as THREE.MeshBasicMaterial).opacity = op
        cap.visible = op > 0.01
      }
    }
    const wantPointer = hoveredRef.current >= 0
    if (wantPointer !== cursorPointerRef.current) {
      cursorPointerRef.current = wantPointer
      document.body.style.cursor = wantPointer ? "pointer" : "auto"
    }
  })

  return (
    <>
      <ambientLight intensity={0.78} />
      <directionalLight position={[3, 6, 8]} intensity={0.6} />
      <directionalLight position={[-5, -3, 4]} intensity={0.22} color="#9fb4ff" />
      {/* Backdrop so any gap between blocks reads as a muted dark-candy seam, never black. */}
      <mesh position={[0, 0, -(TUNING.depth + TUNING.tileDepth + 8)]} raycast={() => {}}>
        <planeGeometry args={[90, 60]} />
        <meshBasicMaterial color="#241c45" toneMapped={false} />
      </mesh>
      {tiles.map((tile, k) => (
        <group key={k}>
          <mesh
            ref={(el) => {
              bodyRefs.current[k] = el
            }}
            geometry={bodyGeom}
            material={bodyMaterials[tile.colorIndex]}
            position={[tile.x, tile.y, tile.baseZ]}
            scale={[TUNING.tileFace, TUNING.tileFace, TUNING.tileDepth]}
            onPointerOver={(e) => {
              e.stopPropagation()
              hoveredRef.current = k
            }}
            onPointerOut={(e) => {
              e.stopPropagation()
              if (hoveredRef.current === k) hoveredRef.current = -1
            }}
            onClick={(e) => {
              e.stopPropagation()
              const p = products[tile.productIndex]
              if (p) router.push(`/${countryCode}/products/${p.handle}`)
            }}
          />
          <mesh
            ref={(el) => {
              capRefs.current[k] = el
            }}
            geometry={capGeom}
            material={capMaterials[k]}
            position={[tile.x, tile.y, tile.baseZ + TUNING.tileDepth / 2 + TUNING.capOffset]}
            scale={[TUNING.tileFace * TUNING.capInset, TUNING.tileFace * TUNING.capInset, 1]}
            visible={false}
            raycast={() => {}}
          />
        </group>
      ))}
    </>
  )
}

function Rig() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(0, TUNING.camY, TUNING.camZ)
    camera.lookAt(0, TUNING.lookY, TUNING.lookZ)
  }, [camera])
  return null
}

type Props = {
  products: Product[]
  countryCode: string
  className?: string
  style?: React.CSSProperties
}

export default function BlockProductHero({ products, countryCode, className, style }: Props) {
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
    const obs = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(
    () => () => {
      document.body.style.cursor = "auto"
    },
    []
  )

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
        frameloop={inView ? "always" : "never"}
        camera={{ position: [0, TUNING.camY, TUNING.camZ], fov: TUNING.fov, near: 0.1, far: 100 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
        style={{ position: "absolute", inset: 0 }}
      >
        <color attach="background" args={[TUNING.bg]} />
        <Rig />
        {products.length > 0 && (
          <Tiles products={products} countryCode={countryCode} reducedMotion={reducedMotion} />
        )}
      </Canvas>
    </div>
  )
}
