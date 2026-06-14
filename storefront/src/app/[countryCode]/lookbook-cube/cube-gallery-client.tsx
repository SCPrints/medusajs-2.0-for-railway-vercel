"use client"

/**
 * Cubic lookbook gallery — the sphere prototype's sibling.
 *
 * You stand at the centre of a cube whose six inner faces are tiled 5×5 with
 * project cards. Drag (or scroll) to look around with inertia + lenis-style
 * easing; hover inverts a card; click flies the camera up to the card
 * face-on and slides a detail page over the top.
 *
 * Everything WebGL lives in one big useEffect (same architecture as
 * sphere-gallery-client.tsx): tile textures are drawn on offscreen canvases
 * (so text labels live *inside* the 3D card), every tile is a flat plane on
 * one of the six cube faces, and GSAP drives the intro, zoom and overlay
 * transitions. The flat faces + visible 90° corners are what make it read as
 * a CUBE instead of the sphere's curved patchwork.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import * as THREE from "three"
import gsap from "gsap"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { CUBE_GRID, type CubeProject } from "./projects"

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const CUBE_HALF = 30 // distance from the centre to each face
const STEP = (CUBE_HALF * 2) / CUBE_GRID // tile pitch along a face
const TILE_H = STEP * 0.93 // gutter between rows
const BASE_FOV = 65
const DETAIL_FOV = 40
// On click the camera flies to a point this far off the wall along the
// tile's normal — every card is viewed face-on, even corner tiles (the
// sphere gets this for free because its tiles all face the centre).
const DETAIL_VIEW_DIST = 19
// Pole stop, same rationale as the sphere: flipping over the top re-orients
// the photos too much. The ceiling/floor faces stay visible + clickable at
// this clamp with the 65° FOV.
const PITCH_LIMIT = THREE.MathUtils.degToRad(75)
const SMOOTHING = 7.5 // larger = snappier follow of the drag target
const INERTIA_DECAY = 2.2 // larger = momentum dies faster
const CLICK_DIST_PX = 7 // drag distance below which pointerup counts as a click

// Card texture LAYOUT space (≈0.94 aspect like the reference tiles). The
// actual canvas is allocated at TEX_SCALE of this — with up to 150 tiles on
// the cube each card renders small enough on screen that 0.75 is visually
// lossless. (Textures are per-project, so GPU memory scales with the photo
// pool, not the tile count.)
const TEX_W = 720
const TEX_H = 768
const TEX_SCALE = 0.75
// Width follows the texture aspect so cards never look squished.
const TILE_W = TILE_H * (TEX_W / TEX_H)
const MONO_STACK =
  '"SF Mono", "Menlo", "Roboto Mono", "Liberation Mono", monospace'

/**
 * Remote lookbook photos live on R2 (pub-*.r2.dev), which sends no CORS
 * headers — drawing them straight into the texture canvas would taint it and
 * the WebGL upload would throw. Route them through the same-origin
 * /_next/image optimizer instead: no taint, downscaled WebP (the originals
 * are multi-MB), and 60-day edge cache. Local /public assets load directly.
 */
const optimizedSrc = (src: string, width: 828 | 1080) =>
  src.startsWith("/")
    ? src
    : `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`

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
  project: CubeProject,
  img: HTMLImageElement | null,
  palette: CardPalette
) {
  canvas.width = Math.round(TEX_W * TEX_SCALE)
  canvas.height = Math.round(TEX_H * TEX_SCALE)
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  // Draw in the full 720×768 layout space regardless of allocation size.
  ctx.scale(TEX_SCALE, TEX_SCALE)

  ctx.fillStyle = palette.bg
  ctx.fillRect(0, 0, TEX_W, TEX_H)

  const pad = 34

  // --- header: brand left, project title right -----------------------------
  // maxWidth args keep arbitrary admin-entered titles from colliding.
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = palette.brand
  ctx.font = `500 28px ${MONO_STACK}`
  ctx.textAlign = "left"
  ctx.fillText(project.brand, pad, 62, TEX_W * 0.52)

  ctx.fillStyle = palette.title
  ctx.font = `400 17px ${MONO_STACK}`
  ctx.textAlign = "right"
  try {
    // letterSpacing is widely supported in Chromium; harmless if missing
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      "2px"
  } catch {}
  ctx.fillText(project.title, TEX_W - pad, 60, TEX_W * 0.38)
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
  // Real lookbook entries may carry no tags/year — skip empties gracefully.
  const footerBaseline = TEX_H - 56
  ctx.textAlign = "left"
  let cursorX = pad
  if (project.category) {
    ctx.font = `400 19px ${MONO_STACK}`
    ctx.fillStyle = palette.meta
    const category = project.category.toUpperCase()
    ctx.fillText(category, pad, footerBaseline)
    cursorX += ctx.measureText(category).width + 18
  }

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

  if (project.year) {
    ctx.font = `400 19px ${MONO_STACK}`
    ctx.fillStyle = palette.year
    ctx.textAlign = "right"
    ctx.fillText(project.year, TEX_W - pad, footerBaseline)
  }
}

// ---------------------------------------------------------------------------
// Cube face layout — six groups, each rotating local -z onto its face
// ---------------------------------------------------------------------------

// Each rotation maps the local frame so that local (0,0,-CUBE_HALF) lands on
// the face: a default PlaneGeometry child (facing local +z) then faces the
// centre of the cube. Ceiling/floor cards keep their "up" toward the back
// wall — same rotate-to-read behaviour as the sphere's pole rings.
const FACE_EULERS: THREE.Euler[] = [
  new THREE.Euler(0, 0, 0), // front  (wall at -z)
  new THREE.Euler(0, Math.PI, 0), // back   (+z)
  new THREE.Euler(0, -Math.PI / 2, 0), // right  (+x)
  new THREE.Euler(0, Math.PI / 2, 0), // left   (-x)
  new THREE.Euler(Math.PI / 2, 0, 0), // top    (+y)
  new THREE.Euler(-Math.PI / 2, 0, 0), // bottom (-y)
]

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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CubeGalleryClient({
  projects,
}: {
  projects: CubeProject[]
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const overlayContentRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<CubeProject | null>(null)
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
      CUBE_HALF * 6
    )
    camera.rotation.order = "YXZ"

    // --- card textures (shared per project, normal + hover states) -----------
    type CardTex = {
      normal: THREE.CanvasTexture
      hover: THREE.CanvasTexture
      normalCanvas: HTMLCanvasElement
      hoverCanvas: HTMLCanvasElement
    }
    const cardTextures: CardTex[] = projects.map((project) => {
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
    projects.forEach((project, i) => {
      const img = new Image()
      img.decoding = "async"
      img.onload = () => {
        const tex = cardTextures[i]
        drawCard(tex.normalCanvas, project, img, PALETTE_NORMAL)
        drawCard(tex.hoverCanvas, project, img, PALETTE_HOVER)
        tex.normal.needsUpdate = true
        tex.hover.needsUpdate = true
      }
      img.src = optimizedSrc(project.image, 828)
      loadedImages.push(img)
    })

    // --- tile meshes ----------------------------------------------------------
    // One shared plane — every tile on a cube is the same size (the sphere
    // needed a geometry per ring).
    const tileGeometry = new THREE.PlaneGeometry(TILE_W, TILE_H)
    const tileMeshes: THREE.Mesh[] = []
    const tileMaterials: THREE.MeshBasicMaterial[] = []
    // Sequential assignment — every tile gets a distinct project as long as
    // the pool is at least tile-count deep.
    let tileIndex = 0
    const centerOffset = (CUBE_GRID - 1) / 2

    FACE_EULERS.forEach((euler) => {
      const group = new THREE.Group()
      group.rotation.copy(euler)
      scene.add(group)
      // World-space face normal pointing back at the camera (cube centre).
      const normal = new THREE.Vector3(0, 0, 1).applyEuler(euler)
      for (let row = 0; row < CUBE_GRID; row++) {
        for (let col = 0; col < CUBE_GRID; col++) {
          const projectIdx = tileIndex++ % projects.length
          const mat = new THREE.MeshBasicMaterial({
            map: cardTextures[projectIdx].normal,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0,
          })
          const mesh = new THREE.Mesh(tileGeometry, mat)
          const local = new THREE.Vector3(
            (col - centerOffset) * STEP,
            (row - centerOffset) * STEP,
            -CUBE_HALF
          )
          mesh.position.copy(local)
          mesh.userData = {
            projectIdx,
            worldPos: local.clone().applyEuler(euler),
            normal,
          }
          group.add(mesh)
          tileMeshes.push(mesh)
          tileMaterials.push(mat)
        }
      }
    })

    // --- control state ---------------------------------------------------------
    const ctrl = {
      yaw: 0,
      pitch: 0,
      targetYaw: 0,
      targetPitch: 0,
      velYaw: 0,
      velPitch: 0,
    }
    // t: 0 = centre of the cube, 1 = parked in front of the clicked card.
    // blend: 0 = free-look rotation, 1 = camera tracks the card centre.
    const zoom = { t: 0, blend: 0, fov: BASE_FOV }
    const camEnd = new THREE.Vector3()
    const lookTarget = new THREE.Vector3()
    const lookDir = new THREE.Vector3()
    let zoomStartYaw = 0
    let zoomStartPitch = 0

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
    // The camera slides from the centre toward a point straight in front of
    // the card while continuously looking AT the card (blended in from the
    // user's current rotation) — so even an edge/corner tile stays centred
    // through the flight and ends perfectly face-on.
    const applyZoom = () => {
      camera.fov = zoom.fov
      camera.updateProjectionMatrix()
      camera.position.copy(camEnd).multiplyScalar(zoom.t)
      lookDir.copy(lookTarget).sub(camera.position).normalize()
      const dYaw = Math.atan2(-lookDir.x, -lookDir.z)
      const dPitch = Math.asin(THREE.MathUtils.clamp(lookDir.y, -1, 1))
      // Write current AND target so the frame loop's smoothing doesn't fight.
      ctrl.yaw = ctrl.targetYaw =
        zoomStartYaw + shortestAngle(dYaw - zoomStartYaw) * zoom.blend
      ctrl.pitch = ctrl.targetPitch =
        zoomStartPitch + (dPitch - zoomStartPitch) * zoom.blend
    }

    const openDetail = (mesh: THREE.Mesh) => {
      if (detailOpenRef.current) return
      detailOpenRef.current = true
      setHovered(null)
      canvas.style.cursor = "default"
      ctrl.velYaw = 0
      ctrl.velPitch = 0

      const worldPos = mesh.userData.worldPos as THREE.Vector3
      const normal = mesh.userData.normal as THREE.Vector3
      lookTarget.copy(worldPos)
      camEnd.copy(worldPos).addScaledVector(normal, DETAIL_VIEW_DIST)
      zoomStartYaw = ctrl.yaw
      zoomStartPitch = ctrl.pitch

      gsap.to(zoom, {
        t: 1,
        blend: 1,
        fov: DETAIL_FOV,
        duration: 1.1,
        ease: "power3.inOut",
        onUpdate: applyZoom,
      })

      const projectIdx = mesh.userData.projectIdx as number
      setSelected(projects[projectIdx])
    }

    const closeDetail = () => {
      // blend stays at 1 → the camera keeps tracking the card all the way
      // home, so you end up at the centre looking at the card you just read.
      gsap.to(zoom, {
        t: 0,
        fov: BASE_FOV,
        duration: 0.95,
        ease: "power3.inOut",
        onUpdate: applyZoom,
        onComplete: () => {
          zoom.blend = 0
          detailOpenRef.current = false
          canvas.style.cursor = "grab"
          // Ceiling/floor cards sit beyond the pitch stop — ease back inside.
          ctrl.targetPitch = clampPitch(ctrl.pitch)
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
      tileGeometry.dispose()
      cardTextures.forEach((t) => {
        t.normal.dispose()
        t.hover.dispose()
      })
      renderer.dispose()
      if (canvas.parentElement === mount) mount.removeChild(canvas)
      apiRef.current = null
    }
    // Rebuild the whole scene if the project list changes (server-rendered
    // prop — stable per page load, so this runs once in practice).
  }, [projects])

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

        {/* bottom-centre nav pills */}
        <nav className="pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center rounded-full bg-white/10 p-1.5 backdrop-blur-sm small:bottom-7">
          {/* !text-black: globals.css paints [class*=rounded-full][class*=text-xs] chips brand-pink */}
          <span className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold !text-black phone:px-5 phone:py-2.5 phone:text-sm">
            Work
          </span>
          <LocalizedClientLink
            href="/lookbook-sphere"
            className="rounded-full px-3.5 py-2 text-xs font-medium !text-white/80 transition-colors hover:!text-white phone:px-5 phone:py-2.5 phone:text-sm"
          >
            Sphere
          </LocalizedClientLink>
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
                  {selected.title}
                </span>
              </div>

              {/* object-contain, not cover — lookbook shots are arbitrary
                  aspect ratios and cover-cropping cut the artwork off */}
              <div
                data-detail-item
                className="flex items-center justify-center overflow-hidden rounded-sm bg-[#161616]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={optimizedSrc(selected.image, 1080)}
                  alt={selected.brand}
                  className="max-h-[55vh] w-auto max-w-full object-contain small:max-h-[62vh]"
                />
              </div>

              {/* brand carries the job name (lookbook item title); title is the
                  studio/credit line — see the page.tsx mapping */}
              <h1
                data-detail-item
                className="mt-10 font-mono text-3xl font-medium uppercase leading-tight tracking-tight small:text-6xl"
              >
                {selected.brand}
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
                {/* Deep-link to the actual garment's PDP (the studio/customizer)
                    when this tile is linked to a product; otherwise fall back to
                    the contact form. */}
                <LocalizedClientLink
                  href={
                    selected.productHandle
                      ? `/products/${selected.productHandle}`
                      : "/contact"
                  }
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
