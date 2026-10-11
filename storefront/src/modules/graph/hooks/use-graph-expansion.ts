"use client"

import { useCallback, useMemo, useRef, useState } from "react"

import { MEDUSA_BACKEND_URL } from "@lib/config"
import type { GraphNode, GraphPayload } from "../../../types/graph"
import { mergePayloads } from "../lib/merge"

type ExpansionState = "idle" | "loading" | "error"

type ClientFetcher = (params: URLSearchParams) => Promise<GraphPayload>

const HUB_KINDS = new Set<GraphNode["kind"]>(["brand", "category", "type", "tag"])

/**
 * Calls the Medusa backend `/store/graph` directly from the browser (this runs
 * after hydration, so the server-only summary fetcher can't be reused). The
 * backend sets `max-age=300`, so re-expanding the same hub in a session is free.
 */
const defaultClientFetcher: ClientFetcher = async (params) => {
  const headers: Record<string, string> = {}
  const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim()
  if (key) headers["x-publishable-api-key"] = key
  const response = await fetch(`${MEDUSA_BACKEND_URL}/store/graph?${params.toString()}`, { headers })
  if (!response.ok) throw new Error(`Graph fetch failed: ${response.status}`)
  return (await response.json()) as GraphPayload
}

export type ExpansionInfo = {
  /** Total products available on the server for this node. */
  total: number
  /** Count merged into the client payload so far. */
  loaded: number
}

export type UseGraphExpansionResult = {
  payload: GraphPayload
  state: ExpansionState
  error: string | null
  expandedNodeIds: Set<string>
  /** Expand a hub node's products in place. No-op for products/root. */
  expandNode: (node: GraphNode) => Promise<void>
  /** Fetch the next page for an already-expanded hub. */
  loadMore: (node: GraphNode) => Promise<void>
  getExpansionInfo: (nodeId: string) => ExpansionInfo | null
}

export function useGraphExpansion(options: {
  initialPayload: GraphPayload
  fetcher?: ClientFetcher
  expansionLimit?: number
}): UseGraphExpansionResult {
  const { initialPayload, fetcher = defaultClientFetcher, expansionLimit = 120 } = options

  const [payload, setPayload] = useState<GraphPayload>(initialPayload)
  const [state, setState] = useState<ExpansionState>("idle")
  const [error, setError] = useState<string | null>(null)

  const expandedRef = useRef<Set<string>>(new Set())
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map())
  const infoRef = useRef<Map<string, ExpansionInfo>>(new Map())

  const buildParams = useCallback(
    (node: GraphNode, offset: number): URLSearchParams | null => {
      if (!HUB_KINDS.has(node.kind)) return null
      const params = new URLSearchParams({ mode: node.kind })
      const [, rawId] = node.id.split(/:(.*)/s)
      if (node.kind === "brand") params.set("brand", node.label)
      else params.set(`${node.kind}_id`, rawId ?? node.id)
      params.set("limit", String(expansionLimit))
      params.set("offset", String(offset))
      return params
    },
    [expansionLimit]
  )

  const runFetch = useCallback(
    async (node: GraphNode, offset: number): Promise<void> => {
      const params = buildParams(node, offset)
      if (!params) return
      const key = `${node.id}:${offset}`
      const existing = inFlightRef.current.get(key)
      if (existing) return existing

      const promise = (async () => {
        setState("loading")
        setError(null)
        try {
          const incoming = await fetcher(params)
          expandedRef.current.add(node.id)
          const products = incoming.nodes.filter((n) => n.kind === "product").length
          const previous = infoRef.current.get(node.id)
          infoRef.current.set(node.id, {
            total: incoming.total ?? previous?.total ?? products,
            loaded: (previous?.loaded ?? 0) + products,
          })
          setPayload((prev) => mergePayloads(prev, incoming))
          setState("idle")
        } catch (err) {
          setError(err instanceof Error ? err.message : "Expansion failed")
          setState("error")
        } finally {
          inFlightRef.current.delete(key)
        }
      })()

      inFlightRef.current.set(key, promise)
      return promise
    },
    [buildParams, fetcher]
  )

  const expandNode = useCallback(
    async (node: GraphNode) => {
      if (!HUB_KINDS.has(node.kind) || expandedRef.current.has(node.id)) return
      return runFetch(node, 0)
    },
    [runFetch]
  )

  const loadMore = useCallback(
    async (node: GraphNode) => {
      const info = infoRef.current.get(node.id)
      if (!info) return expandNode(node)
      if (info.loaded >= info.total) return
      return runFetch(node, info.loaded)
    },
    [expandNode, runFetch]
  )

  const getExpansionInfo = useCallback((nodeId: string) => infoRef.current.get(nodeId) ?? null, [])

  // `expandedRef` mutates in place; expose a fresh Set whenever the payload changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const expandedNodeIds = useMemo(() => new Set(expandedRef.current), [payload])

  return { payload, state, error, expandedNodeIds, expandNode, loadMore, getExpansionInfo }
}
