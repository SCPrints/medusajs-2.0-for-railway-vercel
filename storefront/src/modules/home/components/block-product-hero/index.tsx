"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { useRouter } from "next/navigation"

/**
 * BlockProductHero — a field of soft candy blocks standing on a floor, seen from
 * above at an angle (blocks stand UPRIGHT, never leaning). Hover grows a block
 * UP into a 3D tower (base planted → no bounce, walls reveal) and fades its
 * product image in on the top face. Click opens the product.
 *
 * A live TUNER PANEL (this preview route only) drives the framing/height/density
 * via sliders so the look can be dialled in directly; values persist to
 * localStorage. Once happy, copy them into DEFAULTS and the panel can be dropped.
 */

type Product = { thumbnail: string; handle: string; title: string }

// Tunable (driven by the panel).
type Cfg = {
  cols: number
  rows: number
  fieldHalfW: number
  nearZ: number
  restHeight: number
  liftHeight: number
  camY: number
  camZ: number
  lookZ: number
  fov: number
}

const DEFAULTS: Cfg = {
  cols: 16,
  rows: 10,
  fieldHalfW: 9.5,
  nearZ: 4,
  restHeight: 1.6,
  liftHeight: 2.6,
  camY: 13,
  camZ: 10,
  lookZ: -3,
  fov: 36,
}

// Fixed (not exposed in the panel).
const TILE_FACE_MUL = 1.04
const CORNER_RADIUS = 0.06
const BOB_AMP = 0.04
const BOB_SPEED = 0.55
const BOB_RIPPLE = 1.4
const UP_LERP = 0.07
const DOWN_LERP = 0.025
const CAP_INSET = 0.86
const CAP_OFFSET = 0.05
const FLOOR_Y = -0.1
const BG = "#0c0b1a"
const PALETTE = ["#3dcfc2", "#ff4d7d", "#b9a7ff", "#ffe46b", "#7fe7e0", "#9b7bff"]
const STORAGE_KEY = "scp_product_hero_cfg_v1"

function nextImg(url: string, w = 256): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`
}

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

type Tile = { x: number; z: number; phase: number; productIndex: number; colorIndex: number }

function Tiles({
  products,
  countryCode,
  reducedMotion,
  cfg,
}: {
  products: Product[]
  countryCode: string
  reducedMotion: boolean
  cfg: Cfg
}) {
  const router = useRouter()
  const bodyGeom = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 4, CORNER_RADIUS), [])
  const capGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const roundedAlpha = useMemo(() => makeRoundedAlpha(), [])

  const pitch = (2 * cfg.fieldHalfW) / cfg.cols
  const tileFace = pitch * TILE_FACE_MUL

  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = []
    let k = 0
    for (let i = 0; i < cfg.cols; i++) {
      for (let j = 0; j < cfg.rows; j++) {
        out.push({
          x: (i - (cfg.cols - 1) / 2) * pitch,
          z: cfg.nearZ - j * pitch,
          phase: (i * 0.3 + j * 0.7) * BOB_RIPPLE,
          productIndex: products.length ? k % products.length : 0,
          colorIndex: (i * 3 + j * 5) % PALETTE.length,
        })
        k++
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, cfg.cols, cfg.rows, cfg.fieldHalfW, cfg.nearZ])

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
    const created: THREE.Texture[] = []
    products.forEach((p, idx) => {
      if (!p.thumbnail) return
      loader.load(
        nextImg(p.thumbnail, 256),
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = 4
          created.push(tex)
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
    const t = reducedMotion ? 0 : state.clock.getElapsedTime() * BOB_SPEED
    for (let k = 0; k < tiles.length; k++) {
      const body = bodyRefs.current[k]
      if (!body) continue
      const tile = tiles[k]
      const target = hoveredRef.current === k ? 1 : 0
      const rate = target > raise[k] ? UP_LERP : DOWN_LERP
      raise[k] += (target - raise[k]) * rate
      const bob = reducedMotion ? 0 : Math.sin(t + tile.phase) * BOB_AMP
      const h = cfg.restHeight + raise[k] * cfg.liftHeight + bob
      body.scale.set(tileFace, h, tileFace)
      body.position.set(tile.x, h / 2, tile.z)

      const cap = capRefs.current[k]
      if (cap) {
        cap.position.set(tile.x, h + CAP_OFFSET, tile.z)
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
      <ambientLight intensity={0.62} />
      <directionalLight position={[2, 12, 5]} intensity={0.8} />
      <directionalLight position={[-6, 4, -2]} intensity={0.18} color="#9fb4ff" />
      <mesh position={[0, FLOOR_Y, -3]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <planeGeometry args={[160, 160]} />
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
            position={[tile.x, cfg.restHeight / 2, tile.z]}
            scale={[tileFace, cfg.restHeight, tileFace]}
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
            position={[tile.x, cfg.restHeight + CAP_OFFSET, tile.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[tileFace * CAP_INSET, tileFace * CAP_INSET, 1]}
            visible={false}
            raycast={() => {}}
          />
        </group>
      ))}
    </>
  )
}

function Rig({ cfg }: { cfg: Cfg }) {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(0, cfg.camY, cfg.camZ)
    camera.lookAt(0, 0, cfg.lookZ)
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      ;(camera as THREE.PerspectiveCamera).fov = cfg.fov
      camera.updateProjectionMatrix()
    }
  }, [camera, cfg.camY, cfg.camZ, cfg.lookZ, cfg.fov])
  return null
}

const SLIDERS: { key: keyof Cfg; min: number; max: number; step: number }[] = [
  { key: "cols", min: 6, max: 28, step: 1 },
  { key: "rows", min: 4, max: 18, step: 1 },
  { key: "fieldHalfW", min: 5, max: 16, step: 0.5 },
  { key: "nearZ", min: -2, max: 8, step: 0.5 },
  { key: "restHeight", min: 0.3, max: 4, step: 0.1 },
  { key: "liftHeight", min: 0.5, max: 6, step: 0.1 },
  { key: "camY", min: 2, max: 26, step: 0.5 },
  { key: "camZ", min: 1, max: 26, step: 0.5 },
  { key: "lookZ", min: -14, max: 6, step: 0.5 },
  { key: "fov", min: 18, max: 70, step: 1 },
]

function TunerPanel({ cfg, onChange }: { cfg: Cfg; onChange: (c: Cfg) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <div
      style={{
        position: "absolute",
        top: 90,
        right: 12,
        zIndex: 30,
        width: 230,
        background: "rgba(12,11,26,0.86)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 10,
        padding: open ? "10px 12px" : "6px 12px",
        color: "#fff",
        font: "11px/1.4 ui-monospace, monospace",
        backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 11, letterSpacing: 0.5 }}>HERO TUNER</strong>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ background: "transparent", color: "#ff4d7d", border: 0, cursor: "pointer", fontSize: 14 }}
        >
          {open ? "–" : "+"}
        </button>
      </div>
      {open && (
        <>
          {SLIDERS.map(({ key, min, max, step }) => (
            <label key={key} style={{ display: "block", marginTop: 7 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{key}</span>
                <span style={{ color: "#7fe7e0" }}>{cfg[key]}</span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={cfg[key]}
                onChange={(e) => onChange({ ...cfg, [key]: parseFloat(e.target.value) })}
                style={{ width: "100%" }}
              />
            </label>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button
              onClick={() => navigator.clipboard?.writeText(JSON.stringify(cfg, null, 2))}
              style={{ flex: 1, background: "#3dcfc2", color: "#0c0b1a", border: 0, borderRadius: 6, padding: "5px 0", cursor: "pointer", fontWeight: 700 }}
            >
              Copy values
            </button>
            <button
              onClick={() => onChange({ ...DEFAULTS })}
              style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: 0, borderRadius: 6, padding: "5px 8px", cursor: "pointer" }}
            >
              Reset
            </button>
          </div>
        </>
      )}
    </div>
  )
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
  const [cfg, setCfg] = useState<Cfg>(DEFAULTS)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setCfg({ ...DEFAULTS, ...JSON.parse(raw) })
    } catch {
      /* noop */
    }
  }, [])

  const updateCfg = (c: Cfg) => {
    setCfg(c)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
    } catch {
      /* noop */
    }
  }

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
        background: BG,
        ...style,
      }}
    >
      <Canvas
        frameloop={inView ? "always" : "never"}
        camera={{ position: [0, cfg.camY, cfg.camZ], fov: cfg.fov, near: 0.1, far: 300 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
        style={{ position: "absolute", inset: 0 }}
      >
        <color attach="background" args={[BG]} />
        <Rig cfg={cfg} />
        {products.length > 0 && (
          <Tiles products={products} countryCode={countryCode} reducedMotion={reducedMotion} cfg={cfg} />
        )}
      </Canvas>
      <TunerPanel cfg={cfg} onChange={updateCfg} />
    </div>
  )
}
