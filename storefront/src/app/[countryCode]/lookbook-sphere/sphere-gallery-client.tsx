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
import * as THREE from "three"
import gsap from "gsap"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { LOOKBOOK_PROJECTS, type SphereProject } from "./projects"

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const SPHERE_RADIUS = 30
const COLS = 16 // tiles around the full 360°
const ROWS = 5 // tile rows stacked vertically
const THETA_STEP = (Math.PI * 2) / COLS
const PHI_STEP = THREE.MathUtils.degToRad(24)
const TILE_THETA = THETA_STEP * 0.945 // gutter between columns
const TILE_PHI = PHI_STEP * 0.93 // gutter between rows
const BASE_FOV = 65
const DETAIL_FOV = 40
const DETAIL_DOLLY = 0.42 // fraction of radius the camera travels toward a card
const PITCH_LIMIT = THREE.MathUtils.degToRad(44)
const SMOOTHING = 7.5 // larger = snappier follow of the drag target
const INERTIA_DECAY = 2.2 // larger = momentum dies faster
const CLICK_DIST_PX = 7 // drag distance below which pointerup counts as a click

// Card texture canvas size (≈0.94 aspect like the reference tiles)
const TEX_W = 720
const TEX_H = 768
const MONO_STACK =
  '"SF Mono", "Menlo", "Roboto Mono", "Liberation Mono", monospace'

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
  canvas.width = TEX_W
  canvas.height = TEX_H
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  ctx.fillStyle = palette.bg
  ctx.fillRect(0, 0, TEX_W, TEX_H)

  const pad = 34

  // --- header: brand left, project title right -----------------------------
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = palette.brand
  ctx.font = `500 28px ${MONO_STACK}`
  ctx.textAlign = "left"
  ctx.fillText(project.brand, pad, 62)

  ctx.fillStyle = palette.title
  ctx.font = `400 17px ${MONO_STACK}`
  ctx.textAlign = "right"
  try {
    // letterSpacing is widely supported in Chromium; harmless if missing
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      "2px"
  } catch {}
  ctx.fillText(project.title, TEX_W - pad, 60)
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
  const footerBaseline = TEX_H - 56
  ctx.textAlign = "left"
  ctx.font = `400 19px ${MONO_STACK}`
  ctx.fillStyle = palette.meta
  const category = project.category.toUpperCase()
  ctx.fillText(category, pad, footerBaseline)
  let cursorX = pad + ctx.measureText(category).width + 18

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

  ctx.font = `400 19px ${MONO_STACK}`
  ctx.fillStyle = palette.year
  ctx.textAlign = "right"
  ctx.fillText(project.year, TEX_W - pad, footerBaseline)
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

const GridIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" className={className} aria-hidden>
    <rect x="1" y="1" width="6" height="6" rx="1" />
    <rect x="9" y="1" width="6" height="6" rx="1" />
    <rect x="1" y="9" width="6" height="6" rx="1" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </svg>
)

const ListIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" className={className} aria-hidden>
    <rect x="1" y="2" width="14" height="2.4" rx="1" />
    <rect x="1" y="6.8" width="14" height="2.4" rx="1" />
    <rect x="1" y="11.6" width="14" height="2.4" rx="1" />
  </svg>
)

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SphereGalleryClient() {
  const mountRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const overlayContentRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<SphereProject | null>(null)
  const [introDone, setIntroDone] = useState(false)

  // Imperative bridge between React click-handlers and the WebGL effect.
  const apiRef = useRef<{
    openByMesh: (mesh: THREE.Mesh) => void
    close: () => void
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
    const cardTextures: CardTex[] = LOOKBOOK_PROJECTS.map((project) => {
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
    LOOKBOOK_PROJECTS.forEach((project, i) => {
      const img = new Image()
      img.decoding = "async"
      img.onload = () => {
        const tex = cardTextures[i]
        drawCard(tex.normalCanvas, project, img, PALETTE_NORMAL)
        drawCard(tex.hoverCanvas, project, img, PALETTE_HOVER)
        tex.normal.needsUpdate = true
        tex.hover.needsUpdate = true
      }
      img.src = project.image
      loadedImages.push(img)
    })

    // --- tile meshes ----------------------------------------------------------
    const rowGeometries: THREE.BufferGeometry[] = []
    const tileMeshes: THREE.Mesh[] = []
    const tileMaterials: THREE.MeshBasicMaterial[] = []
    const phiStart = -((ROWS - 1) / 2) * PHI_STEP

    for (let row = 0; row < ROWS; row++) {
      const phiCenter = phiStart + row * PHI_STEP
      const geo = buildSphericalTile(SPHERE_RADIUS, TILE_THETA, phiCenter, TILE_PHI)
      rowGeometries.push(geo)
      for (let col = 0; col < COLS; col++) {
        const projectIdx = (row * 5 + col) % LOOKBOOK_PROJECTS.length
        const mat = new THREE.MeshBasicMaterial({
          map: cardTextures[projectIdx].normal,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
        })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.rotation.y = col * THETA_STEP
        mesh.userData = {
          projectIdx,
          thetaCenter: col * THETA_STEP,
          phiCenter,
        }
        scene.add(mesh)
        tileMeshes.push(mesh)
        tileMaterials.push(mat)
      }
    }

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
        // Click, not drag → open whatever card is under the pointer.
        raycaster.setFromCamera(pointerNdc, camera)
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
      camera.position.copy(detailDir).multiplyScalar(SPHERE_RADIUS * DETAIL_DOLLY * zoom.dolly)
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
      setSelected(LOOKBOOK_PROJECTS[projectIdx])
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

    apiRef.current = { openByMesh: openDetail, close: closeDetail }

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

      // Hover raycast (idle pointer only)
      if (!drag.active && !detailOpenRef.current && pointerNdc.x <= 1) {
        raycaster.setFromCamera(pointerNdc, camera)
        const hits = raycaster.intersectObjects(tileMeshes, false)
        setHovered(hits.length > 0 ? (hits[0].object as THREE.Mesh) : null)
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
  }, [])

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

        {/* bottom-left view toggle (decorative) */}
        <div className="absolute bottom-5 left-5 hidden items-center gap-1 rounded-full bg-white/10 p-1.5 backdrop-blur-sm tablet:flex small:bottom-7 small:left-8">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black">
            <GridIcon />
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-white/60">
            <ListIcon />
          </span>
        </div>

        {/* bottom-centre nav pills */}
        <nav className="pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center rounded-full bg-white/10 p-1.5 backdrop-blur-sm small:bottom-7">
          {/* !text-black: globals.css paints [class*=rounded-full][class*=text-xs] chips brand-pink */}
          <span className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold !text-black phone:px-5 phone:py-2.5 phone:text-sm">
            Work
          </span>
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

        {/* bottom-right filter (decorative) */}
        <div className="absolute bottom-5 right-4 small:bottom-7 small:right-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xs font-semibold !text-black phone:h-16 phone:w-16 phone:text-sm small:h-[72px] small:w-[72px]">
            Filter
          </span>
        </div>
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
                  {selected.brand}
                </span>
              </div>

              <div
                data-detail-item
                className="overflow-hidden rounded-sm bg-[#161616]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.image}
                  alt={selected.title}
                  className="h-[42vh] w-full object-cover small:h-[56vh]"
                />
              </div>

              <h1
                data-detail-item
                className="mt-10 font-mono text-3xl font-medium uppercase leading-tight tracking-tight small:text-6xl"
              >
                {selected.title}
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
                <LocalizedClientLink
                  href="/contact"
                  className="inline-flex items-center gap-3 rounded-full bg-white px-7 py-3.5 text-sm font-semibold !text-black transition-transform duration-300 hover:scale-105"
                >
                  Start a job like this →
                </LocalizedClientLink>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
