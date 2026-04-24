"use client"

import dynamic from "next/dynamic"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react"

import type { GraphLink, GraphNode, GraphPayload } from "../../../types/graph"
import { LINK_COLOR, LINK_COLOR_HIGHLIGHT, NODE_STYLE, nodeRadius } from "../lib/style"
import { getImage } from "../lib/image-pool"

/**
 * react-force-graph depends on `window` (canvas) so it must only render in
 * the browser. Next.js `dynamic(… { ssr: false })` handles this cleanly
 * inside a client component.
 *
 * The library exports a function component that accepts a mutable ref to its
 * imperative methods object. We cast to a minimal subset we actually use.
 */
type ForceGraphMethods = {
  centerAt: (x: number, y: number, durationMs?: number) => unknown
  zoom: (scale: number, durationMs?: number) => unknown
  zoomToFit: (durationMs?: number, padding?: number) => unknown
  graph2ScreenCoords: (x: number, y: number) => { x: number; y: number }
  screen2GraphCoords: (x: number, y: number) => { x: number; y: number }
}

type ForceGraph2DComponent = React.ComponentType<
  Record<string, unknown> & {
    ref?: MutableRefObject<ForceGraphMethods | undefined>
  }
>

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((mod) => mod.default as unknown as ForceGraph2DComponent),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-ui-fg-subtle">
        Loading graph…
      </div>
    ),
  }
) as ForceGraph2DComponent

export type ForceGraphHandle = {
  /** Center and zoom-to-fit on a specific node id. */
  focusNode: (nodeId: string, zoom?: number) => void
  /** Recenter the whole graph. */
  zoomToFit: (durationMs?: number, padding?: number) => void
}

type RenderNode = GraphNode & {
  x?: number
  y?: number
  __isMatch?: boolean
  __isDimmed?: boolean
}

type RenderLink = GraphLink & {
  source: string | RenderNode
  target: string | RenderNode
  __isDimmed?: boolean
}

type Props = {
  payload: GraphPayload
  /** Search input from the parent. Matching nodes are highlighted, others dimmed. */
  highlightQuery?: string
  onNodeClick: (node: GraphNode) => void
  onNodeHover: (node: GraphNode | null, clientXY: { x: number; y: number } | null) => void
  /** Control engine tick behavior — set `cooldownTicks={0}` once the user has settled. */
  cooldownTicks?: number
  onEngineStop?: () => void
  className?: string
}

export const ForceGraph = forwardRef<ForceGraphHandle, Props>(function ForceGraph(
  {
    payload,
    highlightQuery,
    onNodeClick,
    onNodeHover,
    cooldownTicks = 120,
    onEngineStop,
    className,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<ForceGraphMethods | undefined>(undefined)
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })

  useEffect(() => {
    if (!containerRef.current) return
    const element = containerRef.current
    const update = () => {
      const rect = element.getBoundingClientRect()
      setDimensions({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const normalizedQuery = highlightQuery?.trim().toLowerCase() ?? ""
  const hasQuery = normalizedQuery.length > 0

  /**
   * Pre-compute match flags so the per-frame canvas renderer doesn't have to
   * lowercase the query for every node on every tick.
   */
  const { graphData, matchCount } = useMemo(() => {
    const matchIds = new Set<string>()
    const nodes: RenderNode[] = payload.nodes.map((node) => {
      const match = hasQuery && node.label.toLowerCase().includes(normalizedQuery)
      if (match) matchIds.add(node.id)
      return { ...node, __isMatch: match, __isDimmed: hasQuery && !match }
    })

    const resolveId = (value: unknown): string => {
      if (typeof value === "string") return value
      if (value && typeof value === "object" && "id" in value) {
        const id = (value as { id?: unknown }).id
        if (typeof id === "string") return id
      }
      return ""
    }

    const links: RenderLink[] = payload.links.map((link) => {
      const sourceId = resolveId(link.source)
      const targetId = resolveId(link.target)
      const touchesMatch =
        hasQuery && (matchIds.has(sourceId) || matchIds.has(targetId))
      return {
        ...link,
        source: sourceId,
        target: targetId,
        __isDimmed: hasQuery && !touchesMatch,
      }
    })

    return { graphData: { nodes, links }, matchCount: matchIds.size }
  }, [payload, hasQuery, normalizedQuery])

  const nodeCanvasObject = useCallback(
    (node: RenderNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const style = NODE_STYLE[node.kind]
      const radius = nodeRadius(node.kind, node.productCount)
      const x = node.x ?? 0
      const y = node.y ?? 0
      const dim = node.__isDimmed ? 0.15 : 1

      if (node.kind === "product" && node.thumbnail && globalScale > 1.2) {
        const image = getImage(node.thumbnail)
        if (image) {
          ctx.save()
          ctx.globalAlpha = dim
          ctx.beginPath()
          ctx.arc(x, y, radius + 1, 0, Math.PI * 2)
          ctx.closePath()
          ctx.clip()
          ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2)
          ctx.restore()

          ctx.save()
          ctx.globalAlpha = dim
          ctx.strokeStyle = node.__isMatch ? "#fbbf24" : style.stroke
          ctx.lineWidth = node.__isMatch ? 1.5 : 0.75
          ctx.beginPath()
          ctx.arc(x, y, radius + 0.5, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
          return
        }
      }

      ctx.save()
      ctx.globalAlpha = dim
      ctx.fillStyle = style.fill
      ctx.strokeStyle = node.__isMatch ? "#fbbf24" : style.stroke
      ctx.lineWidth = node.__isMatch ? 1.5 : 0.75

      if (node.kind === "product") {
        const size = radius * 2
        ctx.fillRect(x - radius, y - radius, size, size)
        ctx.strokeRect(x - radius, y - radius, size, size)
      } else {
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }

      if (globalScale > 0.9 && (node.kind === "brand" || node.kind === "category" || node.kind === "root")) {
        ctx.fillStyle = style.labelColor
        const fontSize = Math.max(10, 14 / Math.max(1, globalScale))
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        ctx.fillText(node.label, x, y + radius + 2)
      }

      ctx.restore()
    },
    []
  )

  const nodePointerAreaPaint = useCallback(
    (node: RenderNode, color: string, ctx: CanvasRenderingContext2D) => {
      const radius = nodeRadius(node.kind, node.productCount) + 2
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2)
      ctx.fill()
    },
    []
  )

  const linkColor = useCallback((link: RenderLink) => {
    if (link.__isDimmed) return "rgba(148, 163, 184, 0.08)"
    if (hasQuery) return LINK_COLOR_HIGHLIGHT
    return LINK_COLOR
  }, [hasQuery])

  const handleNodeHover = useCallback(
    (node: RenderNode | null, _previous: RenderNode | null) => {
      if (!node) {
        onNodeHover(null, null)
        return
      }
      const container = containerRef.current
      if (!container || node.x == null || node.y == null) {
        onNodeHover(node, null)
        return
      }
      const rect = container.getBoundingClientRect()
      const instance = instanceRef.current
      if (instance?.graph2ScreenCoords) {
        const screen = instance.graph2ScreenCoords(node.x, node.y)
        onNodeHover(node, {
          x: rect.left + screen.x,
          y: rect.top + screen.y,
        })
        return
      }
      onNodeHover(node, { x: rect.left + node.x, y: rect.top + node.y })
    },
    [onNodeHover]
  )

  const handleNodeClick = useCallback(
    (node: RenderNode) => {
      onNodeClick(node)
    },
    [onNodeClick]
  )

  useImperativeHandle(
    ref,
    () => ({
      focusNode(nodeId: string, zoom = 2.5) {
        const node = graphData.nodes.find((n) => n.id === nodeId)
        const instance = instanceRef.current
        if (!node || !instance) return
        if (typeof node.x === "number" && typeof node.y === "number") {
          instance.centerAt(node.x, node.y, 600)
          instance.zoom(zoom, 600)
        }
      },
      zoomToFit(durationMs = 500, padding = 80) {
        instanceRef.current?.zoomToFit(durationMs, padding)
      },
    }),
    [graphData.nodes]
  )

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full ${className ?? ""}`}
      role="application"
      aria-label={`Product graph with ${graphData.nodes.length} nodes${
        hasQuery ? `, ${matchCount} matching search` : ""
      }`}
    >
      {dimensions.width > 0 && dimensions.height > 0 && (
        <ForceGraph2D
          ref={instanceRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="transparent"
          nodeRelSize={4}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={linkColor}
          linkWidth={0.75}
          cooldownTicks={cooldownTicks}
          onEngineStop={onEngineStop}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          enableNodeDrag={true}
          warmupTicks={30}
          d3AlphaDecay={0.045}
          d3VelocityDecay={0.28}
        />
      )}
    </div>
  )
})
