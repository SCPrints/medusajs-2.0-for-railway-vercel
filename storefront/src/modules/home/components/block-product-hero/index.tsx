"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useRouter } from "next/navigation"

/**
 * BlockProductHero — variant 3b. The perspective block-city, but every tile's
 * top is a PRODUCT image: hover a tile to raise it toward you, move off and it
 * eases back down, click to open the product.
 *
 * Each tile is its own textured mesh (so r3f's native per-object pointer events
 * give us hover + click for free — no instanced-atlas raycasting). Textures are
 * loaded through Next's same-origin image optimiser (/_next/image) so they're
 * WebGL-safe (no cross-origin canvas taint). MeshBasicMaterial keeps the product
 * images true-colour (no lighting wash). A gentle ripple bob remains, kept small
 * so the tiles stay a near-solid surface (you don't see under them).
 *
 * "Whole field is products" for now — products repeat across the grid. Curating
 * a chosen subset later is just a matter of which cells get a product vs a
 * plain colour. Three.js + r3f, dynamic-imported ssr:false.
 */

type Product = { thumbnail: string; handle: string; title: string }

const TUNING = {
  cols: 12,
  rows: 8,
  fieldHalfW: 8.4,
  fieldHalfH: 5.4,
  depth: 6, // bowl depth — radial convergence (gentler than the abstract city)
  tileFace: 1.32, // world size of a tile face (big → product images are legible)
  tileDepth: 0.5, // thin-ish so it reads as a tile, not a tall tower
  bobAmplitude: 0.16, // REDUCED — tiles stay a near-solid surface
  bobSpeed: 0.7,
  bobRippleScale: 1.6,
  hoverRaise: 1.4, // how far a hovered tile lifts toward the viewer
  hoverLerp: 0.18, // ease factor toward the raise target (up fast-ish, down slow)
  camZ: 7.4,
  fov: 55,
  bg: "#0c0b1a",
} as const

// Fallback tile colours shown until a product image loads (or if it fails).
const PALETTE = ["#3dcfc2", "#ff4d7d", "#b9a7ff", "#ffe46b", "#7fe7e0", "#9b7bff"]

// Route thumbnails through Next's optimiser → same-origin → safe as a WebGL
// texture (a raw cross-origin R2 URL would taint and fail to upload).
function nextImg(url: string, w = 256): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`
}

type Tile = { x: number; y: number; baseZ: number; phase: number; productIndex: number }

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
  const geom = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])

  const tiles = useMemo<Tile[]>(() => {
    const { cols, rows, fieldHalfW, fieldHalfH, depth, bobRippleScale } = TUNING
    const out: Tile[] = []
    let k = 0
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const u = cols > 1 ? (i / (cols - 1)) * 2 - 1 : 0
        const v = rows > 1 ? (j / (rows - 1)) * 2 - 1 : 0
        const r = Math.min(1, Math.hypot(u, v))
        out.push({
          x: u * fieldHalfW,
          y: v * fieldHalfH,
          baseZ: -depth * (1 - r), // centre far, edges near
          phase: r * bobRippleScale * Math.PI * 2 + (i * 0.3 + j * 0.7),
          productIndex: products.length ? k % products.length : 0,
        })
        k++
      }
    }
    return out
  }, [products])

  // One material per product (shared across the tiles that repeat it). Starts as
  // a palette colour; swaps to the product image (true colour) once it loads.
  const materials = useMemo(
    () =>
      products.map(
        (_, idx) =>
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(PALETTE[idx % PALETTE.length]),
            toneMapped: false,
          })
      ),
    [products]
  )

  useEffect(() => {
    const loader = new THREE.TextureLoader()
    const created: THREE.Texture[] = []
    products.forEach((p, idx) => {
      if (!p.thumbnail) return
      loader.load(
        nextImg(p.thumbnail, 256),
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = 4
          materials[idx].map = tex
          materials[idx].color.set("#ffffff") // let the image show at true colour
          materials[idx].needsUpdate = true
          created.push(tex)
        },
        undefined,
        () => {
          /* keep the palette fallback colour on load failure */
        }
      )
    })
    return () => {
      created.forEach((t) => t.dispose())
    }
  }, [products, materials])

  const meshRefs = useRef<(THREE.Mesh | null)[]>([])
  const raise = useMemo(() => new Float32Array(tiles.length), [tiles.length])
  const hoveredRef = useRef(-1)
  const cursorPointerRef = useRef(false)

  useFrame((state) => {
    const t = reducedMotion ? 0 : state.clock.getElapsedTime() * TUNING.bobSpeed
    for (let k = 0; k < tiles.length; k++) {
      const m = meshRefs.current[k]
      if (!m) continue
      const tile = tiles[k]
      const target = hoveredRef.current === k ? TUNING.hoverRaise : 0
      raise[k] += (target - raise[k]) * TUNING.hoverLerp
      const bob = reducedMotion ? 0 : Math.sin(t + tile.phase) * TUNING.bobAmplitude
      m.position.z = tile.baseZ + bob + raise[k]
    }
    // Drive the cursor from the hover ref (avoids over/out ordering flicker).
    const wantPointer = hoveredRef.current >= 0
    if (wantPointer !== cursorPointerRef.current) {
      cursorPointerRef.current = wantPointer
      document.body.style.cursor = wantPointer ? "pointer" : "auto"
    }
  })

  return (
    <>
      {tiles.map((tile, k) => (
        <mesh
          key={k}
          ref={(el) => {
            meshRefs.current[k] = el
          }}
          geometry={geom}
          material={materials[tile.productIndex]}
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
      ))}
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
    const obs = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Always reset the cursor if we unmount mid-hover.
  useEffect(() => () => {
    document.body.style.cursor = "auto"
  }, [])

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
        camera={{ position: [0, 0, TUNING.camZ], fov: TUNING.fov, near: 0.1, far: 100 }}
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
