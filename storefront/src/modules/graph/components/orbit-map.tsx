"use client"

import Link from "next/link"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"

import type { GraphNode, GraphPayload } from "../../../types/graph"
import { layoutOrbits, linkEndId, type Placed } from "../lib/orbit-layout"
import { SPACE } from "../lib/style"

/**
 * The catalog as a solar system, in plain DOM. Positions come from
 * `layoutOrbits` (pure maths), the camera is one CSS transform on the scene,
 * and every change is a CSS transition — nothing simulates, nothing drifts.
 * Bodies are real elements: crisp SVG logos, hover states, links, keyboard.
 */

export type OrbitMapHandle = {
  fit: (animate?: boolean) => void
  focus: (nodeId: string) => void
  zoomBy: (factor: number) => void
}

type Camera = { x: number; y: number; k: number }

type Props = {
  payload: GraphPayload
  brandLogos: ReadonlyMap<string, string>
  highlightQuery?: string
  selectedNodeId: string | null
  countryCode: string
  onSelect: (node: GraphNode) => void
  onBackgroundClick: () => void
  className?: string
}

const MIN_K = 0.15
const MAX_K = 4
const HUB_KINDS = new Set<GraphNode["kind"]>(["brand", "category", "type", "tag"])

export const OrbitMap = forwardRef<OrbitMapHandle, Props>(function OrbitMap(
  { payload, brandLogos, highlightQuery, selectedNodeId, countryCode, onSelect, onBackgroundClick, className },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, k: 1 })
  const [animateCamera, setAnimateCamera] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const cameraRef = useRef(camera)
  cameraRef.current = camera

  const layout = useMemo(() => layoutOrbits(payload, selectedNodeId), [payload, selectedNodeId])

  const adjacency = useMemo(() => {
    const adj = new Map<string, Set<string>>()
    for (const l of payload.links) {
      const s = linkEndId(l.source)
      const t = linkEndId(l.target)
      if (!adj.has(s)) adj.set(s, new Set())
      if (!adj.has(t)) adj.set(t, new Set())
      adj.get(s)!.add(t)
      adj.get(t)!.add(s)
    }
    return adj
  }, [payload.links])

  /** Focus set: hovered > selected > search matches, each plus neighbours. */
  const { focusIds, hasFocus } = useMemo(() => {
    const q = highlightQuery?.trim().toLowerCase() ?? ""
    const primary = hoveredId ?? selectedNodeId
    if (primary) {
      const set = new Set([primary])
      adjacency.get(primary)?.forEach((id) => set.add(id))
      return { focusIds: set, hasFocus: true }
    }
    if (q) {
      const set = new Set<string>()
      for (const p of layout.placed) {
        if (p.node.label.toLowerCase().includes(q)) {
          set.add(p.node.id)
          adjacency.get(p.node.id)?.forEach((id) => set.add(id))
        }
      }
      return { focusIds: set, hasFocus: true }
    }
    return { focusIds: null as Set<string> | null, hasFocus: false }
  }, [hoveredId, selectedNodeId, highlightQuery, adjacency, layout.placed])

  // ── Camera ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitCamera = useCallback(
    (w: number, h: number): Camera => {
      const k = Math.min(MAX_K, Math.max(MIN_K, Math.min(w, h) / (2 * (layout.extent + 70))))
      return { x: 0, y: 0, k }
    },
    [layout.extent]
  )

  const fittedOnce = useRef(false)
  useEffect(() => {
    if (!size.w || fittedOnce.current) return
    fittedOnce.current = true
    setAnimateCamera(false)
    setCamera(fitCamera(size.w, size.h))
    const id = requestAnimationFrame(() => setAnimateCamera(true))
    return () => cancelAnimationFrame(id)
  }, [size, fitCamera])

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    // px/py: pointer offset from the viewport centre. Keep that world point fixed.
    const c = cameraRef.current
    const k = Math.min(MAX_K, Math.max(MIN_K, c.k * factor))
    const ratio = k / c.k
    setCamera({ k, x: px - (px - c.x) * ratio, y: py - (py - c.y) * ratio })
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      fit: (animate = true) => {
        setAnimateCamera(animate)
        setCamera(fitCamera(size.w, size.h))
      },
      focus: (nodeId) => {
        const p = layout.byId.get(nodeId)
        if (!p) return
        const k = p.node.kind === "brand" ? 1.9 : p.node.kind === "category" ? 1.7 : 1.5
        setAnimateCamera(true)
        setCamera({ k, x: -p.x * k, y: -p.y * k })
      },
      zoomBy: (factor) => {
        setAnimateCamera(true)
        zoomAt(factor, 0, 0)
      },
    }),
    [fitCamera, layout.byId, size, zoomAt]
  )

  // Wheel zoom needs a non-passive listener (React's onWheel can't preventDefault).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      setAnimateCamera(false)
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [zoomAt])

  // Drag to pan + two-finger pinch. Pointer events only; `touch-action: none` on the container.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ startX: number; startY: number; camX: number; camY: number; moved: boolean; pinchDist?: number } | null>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-body]")) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const c = cameraRef.current
    drag.current = { startX: e.clientX, startY: e.clientY, camX: c.x, camY: c.y, moved: false }
    setAnimateCamera(false)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId) || !drag.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = Array.from(pointers.current.values())
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (drag.current.pinchDist) {
        const rect = e.currentTarget.getBoundingClientRect()
        const mx = (pts[0].x + pts[1].x) / 2 - rect.left - rect.width / 2
        const my = (pts[0].y + pts[1].y) / 2 - rect.top - rect.height / 2
        zoomAt(dist / drag.current.pinchDist, mx, my)
      }
      drag.current.pinchDist = dist
      drag.current.moved = true
      return
    }
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY
    if (Math.hypot(dx, dy) > 4) drag.current.moved = true
    if (drag.current.moved) setCamera({ ...cameraRef.current, x: drag.current.camX + dx, y: drag.current.camY + dy })
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (!drag.current) return
    if (pointers.current.size === 0) {
      if (!drag.current.moved) onBackgroundClick()
      drag.current = null
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const selected = selectedNodeId ? layout.byId.get(selectedNodeId) : undefined
  const root = layout.byId.get("root")

  const bodyClass = (p: Placed) => {
    const inFocus = focusIds?.has(p.node.id) ?? false
    const dim = hasFocus && !inFocus
    return `${dim ? "opacity-25" : "opacity-100"}`
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full touch-none select-none overflow-hidden ${drag.current?.moved ? "cursor-grabbing" : "cursor-grab"} ${className ?? ""}`}
      style={{ ["--k" as string]: camera.k }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="group"
      aria-label={`Catalog map with ${layout.placed.length} bodies`}
    >
      <div
        className="absolute left-1/2 top-1/2 h-0 w-0"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})`,
          transition: animateCamera ? "transform 600ms cubic-bezier(.22,.61,.36,1)" : "none",
          willChange: "transform",
        }}
      >
        {/* Orbit rings + links, in world units. */}
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={0} height={0} aria-hidden>
          {layout.rings.map((r) => (
            <circle key={r} cx={0} cy={0} r={r} fill="none" stroke="rgba(197,198,199,0.09)" strokeWidth={1} strokeDasharray="4 7" />
          ))}
          {root &&
            layout.placed
              .filter((p) => !p.hubId && p.node.kind !== "root")
              .map((p) => (
                <line
                  key={`spoke-${p.node.id}`}
                  x1={0}
                  y1={0}
                  x2={p.x}
                  y2={p.y}
                  stroke={hasFocus && !focusIds?.has(p.node.id) ? "rgba(69,162,158,0.04)" : "rgba(69,162,158,0.14)"}
                  strokeWidth={1}
                  style={{ transition: "stroke 300ms" }}
                />
              ))}
          {selected &&
            layout.placed
              .filter((p) => p.hubId === selected.node.id)
              .map((p) => (
                <line
                  key={`sat-${p.node.id}`}
                  x1={selected.x}
                  y1={selected.y}
                  x2={p.x}
                  y2={p.y}
                  stroke={hoveredId && hoveredId !== p.node.id && hoveredId !== selected.node.id ? "rgba(102,252,241,0.12)" : "rgba(102,252,241,0.45)"}
                  strokeWidth={1}
                  className="explore-pop"
                />
              ))}
        </svg>

        {layout.placed.map((p) => (
          <Body
            key={p.node.id}
            placed={p}
            logo={brandLogos.get(p.node.id)}
            isSelected={p.node.id === selectedNodeId}
            isHovered={p.node.id === hoveredId}
            dimClass={bodyClass(p)}
            countryCode={countryCode}
            onHover={setHoveredId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
})

type BodyProps = {
  placed: Placed
  logo?: string
  isSelected: boolean
  isHovered: boolean
  dimClass: string
  countryCode: string
  onHover: (id: string | null) => void
  onSelect: (node: GraphNode) => void
}

/** Labels keep a constant on-screen size by counter-scaling with the camera. */
const LABEL = "pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap font-medium text-[length:calc(12px/var(--k))] leading-none drop-shadow-[0_1px_2px_rgba(11,12,16,0.95)]"

function Body({ placed: p, logo, isSelected, isHovered, dimClass, countryCode, onHover, onSelect }: BodyProps) {
  const { node, x, y, r } = p
  const size = r * 2
  const common = {
    "data-body": true,
    onPointerEnter: () => onHover(node.id),
    onPointerLeave: () => onHover(null),
  }
  const positioned: React.CSSProperties = {
    width: size,
    height: size,
    transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
    transition: "transform 600ms cubic-bezier(.22,.61,.36,1), opacity 250ms",
  }
  const lit = isSelected || isHovered

  if (node.kind === "product") {
    return (
      <Link
        {...common}
        href={`/${countryCode}/products/${node.handle ?? ""}`}
        prefetch={false}
        className={`explore-pop group absolute left-0 top-0 block rounded-full ${dimClass}`}
        style={positioned}
        aria-label={node.label}
      >
        <span
          className="block h-full w-full overflow-hidden rounded-full border bg-[#1F2833] transition-[transform,border-color,box-shadow] duration-200 group-hover:scale-125"
          style={{ borderColor: isHovered ? SPACE.cyan : "rgba(197,198,199,0.5)", boxShadow: isHovered ? `0 0 ${r}px ${SPACE.cyan}` : undefined }}
        >
          {node.thumbnail ? <img src={node.thumbnail} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : null}
        </span>
        <span className={`${LABEL} max-w-[calc(180px/var(--k))] truncate !text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100`}>
          {node.label}
        </span>
      </Link>
    )
  }

  const isHub = HUB_KINDS.has(node.kind)
  const Tag = (isHub ? "button" : "div") as "button"
  const sub = node.kind === "category" && Boolean(p.hubId)
  const labelAlways = node.kind === "root" || node.kind === "brand" || (node.kind === "category" && !sub)

  let disc: React.ReactNode
  if (node.kind === "root") {
    disc = (
      <span
        className="block h-full w-full rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 35%, #FFF8D6 0%, ${SPACE.gold} 55%, #E8A33D 100%)`,
          boxShadow: `0 0 ${r * 1.5}px ${r * 0.6}px rgba(255,230,128,0.35), 0 0 ${r * 4}px rgba(255,230,128,0.15)`,
        }}
      />
    )
  } else if (node.kind === "brand") {
    disc = (
      <span
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border bg-[#E6E7E8] transition-[box-shadow,border-color] duration-300"
        style={{
          borderColor: lit ? SPACE.cyan : SPACE.teal,
          borderWidth: lit ? 2 : 1,
          boxShadow: `0 0 ${lit ? r * 1.4 : r * 0.7}px ${lit ? r * 0.5 : r * 0.2}px rgba(69,162,158,${lit ? 0.6 : 0.35})`,
        }}
      >
        {logo ? <img src={logo} alt="" className="h-[70%] w-[70%] object-contain" draggable={false} /> : <span className="text-[length:calc(10px/var(--k))] font-semibold text-[#0B0C10]">{node.label.slice(0, 2)}</span>}
      </span>
    )
  } else if (node.kind === "type") {
    disc = (
      <span
        className="block h-full w-full rotate-45 border bg-[#1F2833] transition-[background-color,box-shadow] duration-300"
        style={{ borderColor: SPACE.cyan, backgroundColor: lit ? SPACE.cyan : SPACE.dim, boxShadow: lit ? `0 0 ${r}px ${SPACE.cyan}` : undefined }}
      />
    )
  } else if (node.kind === "tag") {
    disc = <span className="block h-full w-full rounded-full" style={{ backgroundColor: lit ? SPACE.gold : "#9098A6" }} />
  } else {
    disc = (
      <span
        className="block h-full w-full rounded-full border transition-[background-color,box-shadow] duration-300"
        style={{
          backgroundColor: lit ? "#E8E9EA" : sub ? "#3A4A5C" : "#2A3548",
          borderColor: lit ? SPACE.cyan : SPACE.bright,
          boxShadow: lit ? `0 0 ${r}px rgba(102,252,241,0.6)` : undefined,
        }}
      />
    )
  }

  return (
    <Tag
      {...common}
      type={isHub ? "button" : undefined}
      onClick={isHub ? (e) => { e.stopPropagation(); onSelect(node) } : undefined}
      className={`group absolute left-0 top-0 block rounded-full p-0 ${isHub ? "cursor-pointer focus-visible:outline-none" : ""} ${sub ? "explore-pop" : ""} ${dimClass}`}
      style={positioned}
      aria-label={isHub ? `${node.label}: show products` : node.label}
      aria-pressed={isHub ? isSelected : undefined}
    >
      {disc}
      <span
        className={`${LABEL} ${lit ? "!text-white" : node.kind === "type" ? "!text-[#66FCF1]" : node.kind === "root" ? "!text-[#FFE680]" : "!text-[#C5C6C7]"} ${
          labelAlways ? "" : "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        } ${lit ? "font-semibold" : ""}`}
      >
        {node.label}
        {isHub && node.productCount ? <span className="ml-1 !text-[#C5C6C7]/60">{node.productCount}</span> : null}
      </span>
    </Tag>
  )
}
