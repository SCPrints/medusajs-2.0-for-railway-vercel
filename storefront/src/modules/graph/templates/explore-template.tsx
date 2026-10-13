"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"

import { getBrandPresentation } from "@modules/brands/data/brands"
import type { GraphNode, GraphPayload } from "../../../types/graph"
import { GraphFilters, type GraphVisibility } from "../components/graph-filters"
import { GraphLegend } from "../components/graph-legend"
import { GraphSearch } from "../components/graph-search"
import { OrbitMap, type OrbitMapHandle } from "../components/orbit-map"
import { StarfieldBackdrop } from "../components/starfield-backdrop"
import { useGraphExpansion } from "../hooks/use-graph-expansion"
import { filterPayload } from "../lib/merge"
import { HUD_BUTTON, HUD_LABEL, HUD_SURFACE } from "../lib/style"

type Props = {
  initialPayload: GraphPayload
}

const DEFAULT_VISIBILITY: GraphVisibility = {
  root: true,
  brand: true,
  category: true,
  type: true,
  tag: false, // 140+ tags — off by default, toggle in the HUD
  product: true,
}

const HUB_KINDS = new Set<GraphNode["kind"]>(["brand", "category", "type", "tag"])

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

export function ExploreTemplate({ initialPayload }: Props) {
  const params = useParams()
  const countryCode = (Array.isArray(params?.countryCode) ? params.countryCode[0] : params?.countryCode) ?? "au"

  const [visibility, setVisibility] = useState<GraphVisibility>(DEFAULT_VISIBILITY)
  const [search, setSearch] = useState("")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [controlsOpen, setControlsOpen] = useState(false)

  const mapRef = useRef<OrbitMapHandle | null>(null)
  const { payload, state, error, expandedNodeIds, expandNode, loadMore, getExpansionInfo } = useGraphExpansion({
    initialPayload,
  })

  /** Brand planets get their logo from the storefront presentation map (every brand has one). */
  const brandLogos = useMemo(() => {
    const map = new Map<string, string>()
    for (const node of payload.nodes) {
      if (node.kind !== "brand") continue
      const logo = getBrandPresentation(node.handle ?? slug(node.label)).logoSrc
      if (logo) map.set(node.id, logo)
    }
    return map
  }, [payload.nodes])

  const visiblePayload = useMemo(() => filterPayload(payload, visibility), [payload, visibility])

  const selectNode = useCallback(
    (node: GraphNode) => {
      if (!HUB_KINDS.has(node.kind)) return
      setSelectedNodeId(node.id)
      if (!expandedNodeIds.has(node.id)) void expandNode(node)
      mapRef.current?.focus(node.id)
    },
    [expandNode, expandedNodeIds]
  )

  /** `?focus=<node id>` deep link, read client-side so the page stays static. */
  useEffect(() => {
    const focusId = new URLSearchParams(window.location.search).get("focus")
    if (!focusId) return
    const target = initialPayload.nodes.find((n) => n.id === focusId)
    if (target) {
      const t = window.setTimeout(() => selectNode(target), 50)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedNode = selectedNodeId ? payload.nodes.find((n) => n.id === selectedNodeId) ?? null : null
  const selectedInfo = selectedNodeId ? getExpansionInfo(selectedNodeId) : null
  const canLoadMore = Boolean(selectedNode && selectedInfo && selectedInfo.loaded < selectedInfo.total)
  const emptySelection = Boolean(selectedNode && selectedInfo && selectedInfo.total === 0 && state !== "loading")

  const status = (
    <div className={`${HUD_SURFACE} flex flex-col gap-2 p-3 text-xsmall-regular`}>
      <p className={HUD_LABEL}>Catalog map</p>
      {selectedNode ? (
        <p>
          Orbiting <strong className="!text-white">{selectedNode.label}</strong>
          {selectedInfo ? ` · ${selectedInfo.loaded}/${selectedInfo.total} products` : ""}
        </p>
      ) : (
        <p className="!text-[#C5C6C7]/70">Click a planet or moon to see its products.</p>
      )}
      {state === "loading" ? <p className="!text-[#66FCF1]">Scanning…</p> : null}
      {state === "error" && error ? <p className="!text-rose-400">{error}</p> : null}
      {emptySelection ? <p className="!text-[#C5C6C7]/70">No products assigned here yet.</p> : null}
      <div className="flex gap-2">
        <button type="button" onClick={() => mapRef.current?.zoomBy(1.4)} className={`${HUD_BUTTON} flex-1 text-center`} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => mapRef.current?.zoomBy(1 / 1.4)} className={`${HUD_BUTTON} flex-1 text-center`} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => mapRef.current?.fit()} className={`${HUD_BUTTON} flex-[2]`}>
          Fit view
        </button>
      </div>
      {selectedNode ? (
        <button type="button" onClick={() => setSelectedNodeId(null)} className={HUD_BUTTON}>
          Clear selection
        </button>
      ) : null}
      {canLoadMore && selectedNode ? (
        <button type="button" onClick={() => void loadMore(selectedNode)} disabled={state === "loading"} className={HUD_BUTTON}>
          Load more from {selectedNode.label}
        </button>
      ) : null}
    </div>
  )

  return (
    <section className="relative h-[calc(100dvh-var(--nav-height))] w-full overflow-hidden bg-[#0B0C10]">
      <StarfieldBackdrop className="pointer-events-none absolute inset-0 h-full w-full" />

      <OrbitMap
        ref={mapRef}
        payload={visiblePayload}
        brandLogos={brandLogos}
        highlightQuery={search}
        selectedNodeId={selectedNodeId}
        countryCode={countryCode}
        onSelect={selectNode}
        onBackgroundClick={() => setSelectedNodeId(null)}
        className="absolute inset-0"
      />

      {/* Search — top left, never under the right-hand stack. */}
      <div className="pointer-events-none absolute left-4 right-4 top-4 tablet:right-auto tablet:w-80">
        <GraphSearch value={search} onChange={setSearch} className="pointer-events-auto" />
      </div>

      {/* Desktop/tablet cockpit stack. */}
      <div className="pointer-events-none absolute right-4 top-4 hidden w-64 flex-col gap-2 tablet:flex">
        <div className="pointer-events-auto">{status}</div>
        <GraphFilters value={visibility} onChange={setVisibility} className="pointer-events-auto" />
        <GraphLegend className="pointer-events-auto" />
      </div>

      <div
        className={`pointer-events-none absolute left-4 hidden max-w-sm p-3 text-xsmall-regular tablet:block ${HUD_SURFACE}`}
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <p>Drag to pan, scroll to zoom. Click a planet (brand) or moon (category) to orbit its products; click a product to open it.</p>
      </div>

      {/* Phone: one Controls button + bottom sheet, clear of the chat bubble on the right. */}
      <div className="absolute left-4 tablet:hidden" style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        <button
          type="button"
          onClick={() => setControlsOpen((open) => !open)}
          aria-expanded={controlsOpen}
          className={`${HUD_SURFACE} min-h-11 min-w-11 px-4 text-small-regular`}
        >
          {controlsOpen ? "Close" : "Controls"}
        </button>
      </div>
      {controlsOpen ? (
        <div
          className="absolute inset-x-0 bottom-0 max-h-[70%] overflow-y-auto border-t border-[#45A29E]/30 bg-[#0B0C10]/95 p-4 tablet:hidden"
          style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex flex-col gap-3">
            {status}
            <GraphFilters value={visibility} onChange={setVisibility} />
            <GraphLegend />
          </div>
        </div>
      ) : null}
    </section>
  )
}
