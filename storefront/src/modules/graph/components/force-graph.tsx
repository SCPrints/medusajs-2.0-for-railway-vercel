"use client"

import dynamic from "next/dynamic"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import { forceCollide, forceRadial } from "d3-force"

import { drawPlanetGlow } from "@modules/home/components/space-hero/starfield"
import type { GraphLink, GraphNode, GraphPayload } from "../../../types/graph"
import {
  LINK_COLOR,
  LINK_COLOR_DIMMED,
  LINK_COLOR_HIGHLIGHT,
  NODE_STYLE,
  RING_COLOR,
  RING_RADIUS,
  SPACE,
  nodeRadius,
} from "../lib/style"
import { getImage, onImageLoaded, preloadImages } from "../lib/image-pool"

/**
 * react-force-graph depends on `window` (canvas) so it must only render in
 * the browser. We type the handful of imperative methods + props we use.
 */
type D3Force = {
  strength?: (value: number | ((d: unknown) => number)) => D3Force
  distance?: (value: number | ((link: unknown) => number)) => D3Force
}

type ForceGraphMethods = {
  centerAt: (x: number, y: number, durationMs?: number) => unknown
  zoom: (scale: number, durationMs?: number) => unknown
  zoomToFit: (durationMs?: number, padding?: number) => unknown
  graph2ScreenCoords: (x: number, y: number) => { x: number; y: number }
  d3Force: (name: string, force?: unknown) => D3Force | undefined
  d3ReheatSimulation?: () => unknown
}

type ForceGraph2DComponent = React.ComponentType<
  Record<string, unknown> & { ref?: (instance: ForceGraphMethods | null) => void }
>

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((mod) => mod.default as unknown as ForceGraph2DComponent),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-small-regular !text-[#C5C6C7]/70">
        Charting the catalog…
      </div>
    ),
  }
) as ForceGraph2DComponent

const LABEL_TARGET_SCREEN_PX = 12

/** Constant on-screen label size with a dark halo so text reads over stars and links. */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  globalScale: number,
  bold: boolean,
  color: string
) {
  const fontSize = LABEL_TARGET_SCREEN_PX / Math.max(0.2, globalScale)
  ctx.font = `${bold ? "600 " : ""}${fontSize}px Inter, system-ui, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.lineWidth = Math.max(2, fontSize / 3)
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  ctx.strokeStyle = "rgba(11, 12, 16, 0.9)"
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

export type ForceGraphHandle = {
  /** Center and zoom on a node id. */
  focusNode: (nodeId: string, zoom?: number) => void
  /** Frame the whole graph. */
  zoomToFit: (durationMs?: number, padding?: number) => void
}

type RenderNode = GraphNode & { x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number }

type RenderLink = GraphLink & { source: string | RenderNode; target: string | RenderNode }

type Props = {
  payload: GraphPayload
  /** Logo URL per brand node id (resolved by the template from the brand handle). */
  brandLogos: ReadonlyMap<string, string>
  /** Search input from the parent. Matching nodes light up, others dim. */
  highlightQuery?: string
  /** Persistent selection (last click). */
  selectedNodeId?: string | null
  onNodeClick: (node: GraphNode) => void
  onNodeHover: (node: GraphNode | null, clientXY: { x: number; y: number } | null) => void
  onEngineStop?: () => void
  onBackgroundClick?: () => void
  className?: string
}

function linkEndId(value: unknown): string {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === "string") return id
  }
  return ""
}

function isSubCategory(node: RenderNode, subCategoryIds: Set<string>) {
  return node.kind === "category" && subCategoryIds.has(node.id)
}

export const ForceGraph = forwardRef<ForceGraphHandle, Props>(function ForceGraph(
  {
    payload,
    brandLogos,
    highlightQuery,
    selectedNodeId,
    onNodeClick,
    onNodeHover,
    onEngineStop,
    onBackgroundClick,
    className,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<ForceGraphMethods | null>(null)
  const [ready, setReady] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  // Bumped when a thumbnail/logo finishes loading so the on-demand canvas repaints once.
  const [imageTick, bumpImageTick] = useReducer((n: number) => n + 1, 0)

  const setInstance = useCallback((instance: ForceGraphMethods | null) => {
    instanceRef.current = instance
    setReady(Boolean(instance))
  }, [])

  useEffect(() => onImageLoaded(bumpImageTick), [])
  useEffect(() => {
    preloadImages(Array.from(brandLogos.values()))
  }, [brandLogos])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = () => {
      const rect = element.getBoundingClientRect()
      setDimensions({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const normalizedQuery = highlightQuery?.trim().toLowerCase() ?? ""
  const hasQuery = normalizedQuery.length > 0

  /**
   * Graph data for the simulation. Node objects are passed through UNCHANGED
   * so d3 keeps the x/y it wrote on them across merges and filter toggles
   * (cloning here was what re-spiralled the whole layout on every change).
   * New nodes are seeded near their hub (or on their orbit) so expansions
   * bloom out of the planet instead of flying in from the origin.
   */
  const { graphData, adjacency, subCategoryIds, presentKinds } = useMemo(() => {
    const nodes = payload.nodes as RenderNode[]
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const adj = new Map<string, Set<string>>()
    const subs = new Set<string>()
    const links: RenderLink[] = []
    for (const link of payload.links) {
      const source = linkEndId(link.source)
      const target = linkEndId(link.target)
      if (!source || !target || !byId.has(source) || !byId.has(target)) continue
      if (!adj.has(source)) adj.set(source, new Set())
      if (!adj.has(target)) adj.set(target, new Set())
      adj.get(source)!.add(target)
      adj.get(target)!.add(source)
      if (link.kind === "category-parent") subs.add(source)
      links.push({ ...link, source, target })
    }

    const kinds = new Set(nodes.map((n) => n.kind))
    for (const node of nodes) {
      if (node.kind === "root") {
        node.fx = 0
        node.fy = 0
        continue
      }
      if (typeof node.x === "number") continue
      // Seed next to the hub we hang off (product → hub, sub-category → parent)…
      const hubId = links.find((l) => l.source === node.id && l.target !== "root")?.target as string | undefined
      const hub = hubId ? byId.get(hubId) : undefined
      if (hub && typeof hub.x === "number" && typeof hub.y === "number") {
        const a = Math.random() * Math.PI * 2
        node.x = hub.x + Math.cos(a) * 12
        node.y = hub.y + Math.sin(a) * 12
        continue
      }
      // …or on our orbit, at a stable angle derived from the id.
      const ring = RING_RADIUS[node.kind]
      if (ring) {
        let h = 0
        for (let i = 0; i < node.id.length; i++) h = (h * 31 + node.id.charCodeAt(i)) >>> 0
        const a = (h % 3600) / 3600 * Math.PI * 2
        node.x = Math.cos(a) * ring
        node.y = Math.sin(a) * ring
      }
    }

    return { graphData: { nodes, links }, adjacency: adj, subCategoryIds: subs, presentKinds: kinds }
  }, [payload])

  /** Focus neighbourhood: hovered > selected > search matches (+ direct neighbours). */
  const { focusIds, matchCount, hasFocus } = useMemo(() => {
    const matches = new Set<string>()
    if (hasQuery) {
      for (const n of graphData.nodes) {
        if (n.label.toLowerCase().includes(normalizedQuery)) matches.add(n.id)
      }
    }
    const primary = hoveredNodeId ?? selectedNodeId ?? null
    if (primary) {
      const set = new Set<string>([primary])
      adjacency.get(primary)?.forEach((id) => set.add(id))
      return { focusIds: set, matchCount: matches.size, hasFocus: true }
    }
    if (matches.size > 0) {
      const set = new Set<string>(matches)
      matches.forEach((id) => adjacency.get(id)?.forEach((n) => set.add(n)))
      return { focusIds: set, matchCount: matches.size, hasFocus: true }
    }
    return { focusIds: null as Set<string> | null, matchCount: 0, hasFocus: false }
  }, [graphData.nodes, adjacency, hoveredNodeId, selectedNodeId, hasQuery, normalizedQuery])

  const primaryNodeId = hoveredNodeId ?? selectedNodeId ?? null

  const nodeCanvasObject = useCallback(
    (node: RenderNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const style = NODE_STYLE[node.kind]
      const x = node.x ?? 0
      const y = node.y ?? 0
      const isPrimary = primaryNodeId === node.id
      const inFocus = focusIds?.has(node.id) ?? false
      const alpha = hasFocus && !inFocus ? 0.2 : 1
      const sub = isSubCategory(node, subCategoryIds)
      const radius = sub ? 4 : nodeRadius(node.kind, node.productCount)
      const ringColor = isPrimary ? SPACE.cyan : inFocus ? style.highlightFill : style.stroke
      const labelColor = inFocus || isPrimary ? style.labelHighlightColor : style.labelColor
      const highZoom = globalScale > 1.6

      ctx.save()
      ctx.globalAlpha = alpha

      if (node.kind === "root") {
        drawPlanetGlow(ctx, x, y, radius, SPACE.gold, 1.4)
        const g = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius)
        g.addColorStop(0, "#FFF8D6")
        g.addColorStop(0.6, SPACE.gold)
        g.addColorStop(1, "#E8A33D")
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
        if (globalScale > 0.6) drawLabel(ctx, node.label, x, y + radius + 4, globalScale, true, labelColor)
        ctx.restore()
        return
      }

      if (node.kind === "brand") {
        drawPlanetGlow(ctx, x, y, radius, SPACE.teal, isPrimary ? 1.2 : inFocus ? 0.8 : 0.4)
        ctx.fillStyle = inFocus ? style.highlightFill : style.fill
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
        const logo = getImage(brandLogos.get(node.id))
        if (logo) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.clip()
          const pad = radius * 0.2
          const max = (radius - pad) * 2
          const ratio = logo.width / Math.max(1, logo.height)
          let w = max
          let h = max / ratio
          if (h > max) {
            h = max
            w = max * ratio
          }
          ctx.drawImage(logo, x - w / 2, y - h / 2, w, h)
          ctx.restore()
        }
        ctx.strokeStyle = ringColor
        ctx.lineWidth = isPrimary ? 2.5 : inFocus ? 1.75 : 1
        ctx.beginPath()
        ctx.arc(x, y, radius + 0.5, 0, Math.PI * 2)
        ctx.stroke()
        drawLabel(ctx, node.label, x, y + radius + 3, globalScale, isPrimary, labelColor)
        ctx.restore()
        return
      }

      if (node.kind === "product") {
        const image = globalScale > 1.2 && node.thumbnail ? getImage(node.thumbnail) : null
        if (image) {
          const r = 6
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.clip()
          ctx.drawImage(image, x - r, y - r, r * 2, r * 2)
          ctx.restore()
          ctx.save()
          ctx.globalAlpha = alpha
          ctx.strokeStyle = ringColor
          ctx.lineWidth = isPrimary ? 1.5 : 0.75
          ctx.beginPath()
          ctx.arc(x, y, r + 0.5, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          ctx.fillStyle = inFocus ? style.highlightFill : style.fill
          ctx.beginPath()
          ctx.arc(x, y, isPrimary ? radius + 1 : radius, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
        return
      }

      ctx.fillStyle = inFocus ? style.highlightFill : style.fill
      ctx.strokeStyle = ringColor
      ctx.lineWidth = isPrimary ? 2 : inFocus ? 1.25 : 0.75
      ctx.beginPath()
      if (node.kind === "type") {
        ctx.moveTo(x, y - radius)
        ctx.lineTo(x + radius, y)
        ctx.lineTo(x, y + radius)
        ctx.lineTo(x - radius, y)
        ctx.closePath()
      } else {
        ctx.arc(x, y, radius, 0, Math.PI * 2)
      }
      ctx.fill()
      if (node.kind !== "tag") ctx.stroke()

      // Moon labels are always on from ~tablet fit-zoom up; on a phone's tighter
      // fit they would pile on top of the planet labels.
      const alwaysLabel = node.kind === "category" && !sub && globalScale > 0.55
      if (alwaysLabel || highZoom || (hasFocus && inFocus)) {
        drawLabel(ctx, node.label, x, y + radius + 3, globalScale, isPrimary, labelColor)
      }
      ctx.restore()
    },
    // imageTick is intentionally a dependency: a new callback identity makes the
    // library repaint once when a bitmap lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusIds, hasFocus, primaryNodeId, subCategoryIds, brandLogos, imageTick]
  )

  const nodePointerAreaPaint = useCallback(
    (node: RenderNode, color: string, ctx: CanvasRenderingContext2D) => {
      const radius = Math.max(6, nodeRadius(node.kind, node.productCount) + 2)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2)
      ctx.fill()
    },
    []
  )

  const linkInFocus = useCallback(
    (link: RenderLink) =>
      Boolean(focusIds?.has(linkEndId(link.source)) && focusIds?.has(linkEndId(link.target))),
    [focusIds]
  )
  const linkColor = useCallback(
    (link: RenderLink) => (!hasFocus ? LINK_COLOR : linkInFocus(link) ? LINK_COLOR_HIGHLIGHT : LINK_COLOR_DIMMED),
    [hasFocus, linkInFocus]
  )
  const linkWidth = useCallback(
    (link: RenderLink) => (!hasFocus ? 0.6 : linkInFocus(link) ? 1.4 : 0.3),
    [hasFocus, linkInFocus]
  )

  /** Orbit rings, drawn in graph space before nodes/links. */
  const onRenderFramePre = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      ctx.save()
      ctx.strokeStyle = RING_COLOR
      ctx.lineWidth = 1 / globalScale
      ctx.setLineDash([4 / globalScale, 6 / globalScale])
      for (const kind of ["brand", "category", "type", "tag"] as const) {
        const r = RING_RADIUS[kind]
        if (!r || !presentKinds.has(kind)) continue
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    },
    [presentKinds]
  )

  const handleNodeHover = useCallback(
    (node: RenderNode | null) => {
      setHoveredNodeId(node?.id ?? null)
      const container = containerRef.current
      const instance = instanceRef.current
      if (!node || !container || !instance || node.x == null || node.y == null) {
        onNodeHover(node, null)
        return
      }
      const rect = container.getBoundingClientRect()
      const screen = instance.graph2ScreenCoords(node.x, node.y)
      onNodeHover(node, { x: rect.left + screen.x, y: rect.top + screen.y })
    },
    [onNodeHover]
  )

  useImperativeHandle(
    ref,
    () => ({
      focusNode(nodeId, zoom = 2.2) {
        const node = (graphData.nodes as RenderNode[]).find((n) => n.id === nodeId)
        const instance = instanceRef.current
        if (!node || !instance || typeof node.x !== "number" || typeof node.y !== "number") return
        instance.centerAt(node.x, node.y, 600)
        instance.zoom(zoom, 600)
      },
      zoomToFit(durationMs = 500, padding = 60) {
        instanceRef.current?.zoomToFit(durationMs, padding)
      },
    }),
    [graphData.nodes]
  )

  /**
   * Orbital layout: the sun is pinned at the origin, each ringed kind is pulled
   * onto its orbit, and spokes to the root have the same length as the ring so
   * the two forces agree. Re-applied whenever the data changes AND once the
   * lazy-loaded library instance is ready (it is not on first render).
   */
  useEffect(() => {
    const instance = instanceRef.current
    if (!ready || !instance?.d3Force) return

    const link = instance.d3Force("link")
    link?.distance?.((l: unknown) => {
      const kind = (l as { kind?: string } | null)?.kind
      if (kind === "category-parent") return 28
      if (kind?.startsWith("product-")) return 22
      if (kind === "brand-root") return RING_RADIUS.brand!
      if (kind === "category-root") return RING_RADIUS.category!
      if (kind === "type-root") return RING_RADIUS.type!
      if (kind === "tag-root") return RING_RADIUS.tag!
      return 16
    })
    // Product dust orbits the SELECTED hub only; its links to the other hubs it
    // belongs to (category/type/tag) stay drawn but barely pull, otherwise every
    // product gets dragged into the gap between three rings.
    link?.strength?.((l: unknown) => {
      const kind = (l as { kind?: string } | null)?.kind ?? ""
      if (kind.endsWith("-root")) return 0.1
      if (kind.startsWith("product-")) {
        return linkEndId((l as RenderLink).target) === selectedNodeId ? 0.9 : 0.02
      }
      return 0.6
    })

    instance.d3Force("charge")?.strength?.((d: unknown) => {
      const node = d as RenderNode
      if (node.kind === "root") return -300
      if (node.kind === "brand") return -200
      if (node.kind === "category") return isSubCategory(node, subCategoryIds) ? -30 : -260
      if (node.kind === "type") return -90
      if (node.kind === "tag") return -20
      return -8
    })

    instance.d3Force(
      "radial",
      forceRadial(
        (d: unknown) => RING_RADIUS[(d as RenderNode).kind] ?? 0,
        0,
        0
      ).strength((d: unknown) => {
        const node = d as RenderNode
        return RING_RADIUS[node.kind] && !isSubCategory(node, subCategoryIds) ? 0.6 : 0
      })
    )

    instance.d3Force(
      "collide",
      forceCollide()
        .radius((d: unknown) => {
          const node = d as RenderNode
          return (isSubCategory(node, subCategoryIds) ? 4 : nodeRadius(node.kind, node.productCount)) + 2
        })
        .iterations(2)
    )

    instance.d3Force("center")?.strength?.(0)
    instance.d3ReheatSimulation?.()
  }, [graphData, ready, subCategoryIds, selectedNodeId])

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full ${className ?? ""}`}
      role="application"
      aria-label={`Catalog map with ${graphData.nodes.length} nodes${hasQuery ? `, ${matchCount} matching search` : ""}`}
    >
      {dimensions.width > 0 && dimensions.height > 0 && (
        <ForceGraph2D
          ref={setInstance}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="transparent"
          nodeRelSize={4}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkCurvature={0}
          onRenderFramePre={onRenderFramePre}
          cooldownTicks={200}
          onEngineStop={onEngineStop}
          onNodeClick={onNodeClick}
          onNodeHover={handleNodeHover}
          onBackgroundClick={onBackgroundClick}
          enableNodeDrag={true}
          warmupTicks={20}
          d3AlphaDecay={0.04}
          d3VelocityDecay={0.4}
        />
      )}
    </div>
  )
})
