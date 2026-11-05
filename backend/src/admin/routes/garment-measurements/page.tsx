import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowsPointingOut } from "@medusajs/icons"
import { Badge, Container, Heading, Input, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { STATUS } from "../../components/garment-measurements/status"
import { AppLink } from "../../lib/nav"
import { NAV_COLOR, tinted } from "../../lib/nav-tint"
import { GARMENTS, type GarmentType, type SizeStatus } from "../../../lib/garment-measurements"

/**
 * /app/garment-measurements — products with 3D measurements, plus a search to
 * start on any other product. Each opens the per-product measuring page.
 */
type Measured = {
  id: string
  title: string
  thumbnail: string | null
  garment_type: GarmentType
  status: Record<string, SizeStatus>
}
type Found = { id: string; title: string; thumbnail: string | null }

const Thumb = ({ src }: { src: string | null }) =>
  src ? (
    <img src={src} alt="" className="bg-ui-bg-subtle h-12 w-12 shrink-0 rounded object-contain" />
  ) : (
    <div className="bg-ui-bg-subtle h-12 w-12 shrink-0 rounded" />
  )

const rowClass = "border-ui-border-base hover:bg-ui-bg-base-hover flex min-h-16 items-center gap-3 rounded-lg border p-3"

const GarmentMeasurementsListPage = () => {
  const [measured, setMeasured] = useState<Measured[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [found, setFound] = useState<Found[] | null>(null)

  useEffect(() => {
    fetch("/admin/garment-measurements", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setMeasured(d.products))
      .catch((e) => setError(`Couldn't load: ${e.message}`))
  }, [])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return setFound(null)
    const t = setTimeout(() => {
      // Relevance-ranked (Meilisearch, title first); Medusa's own ?q= is an unordered ILIKE over descriptions too.
      fetch(`/admin/quote-pricer/search?q=${encodeURIComponent(term)}&limit=20`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { products: [] }))
        .then((d) => setFound(d.products ?? []))
        .catch(() => setFound([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <Container className="flex flex-col gap-y-6 p-4 sm:p-6">
      <div>
        <Heading level="h1">3D measurements</Heading>
        <Text className="text-ui-fg-subtle">
          Flat measurements of each garment, per size, for the 3D garment builder. Internal only, never shown to customers.
        </Text>
      </div>

      <div className="flex flex-col gap-y-2">
        <Text weight="plus">Measure a garment</Text>
        <Input
          type="search"
          placeholder="Search products, e.g. Supply Hood or 5101"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {found && (
          <div className="flex flex-col gap-y-2">
            {found.length === 0 && <Text size="small" className="text-ui-fg-muted">No products found.</Text>}
            {found.map((p) => (
              <AppLink key={p.id} href={`/app/garment-measurements/${p.id}`} className={rowClass}>
                <Thumb src={p.thumbnail} />
                <Text weight="plus">{p.title}</Text>
              </AppLink>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-y-2">
        <Text weight="plus">Already measured</Text>
        {error && <Text className="text-ui-fg-error">{error}</Text>}
        {!measured && !error && <Text size="small" className="text-ui-fg-muted">Loading…</Text>}
        {measured?.length === 0 && <Text size="small" className="text-ui-fg-muted">Nothing measured yet. Search above to start.</Text>}
        {measured?.map((p) => (
          <AppLink key={p.id} href={`/app/garment-measurements/${p.id}`} className={rowClass}>
            <Thumb src={p.thumbnail} />
            <div className="flex min-w-0 flex-col gap-1">
              <Text weight="plus">{p.title}</Text>
              <Text size="small" className="text-ui-fg-muted">{GARMENTS[p.garment_type].label}</Text>
              <div className="flex flex-wrap gap-1">
                {Object.entries(p.status).map(([size, st]) => (
                  <Badge key={size} size="2xsmall" color={STATUS[st].color} title={STATUS[st].label}>{size}</Badge>
                ))}
              </div>
            </div>
          </AppLink>
        ))}
      </div>
      <Text size="small" className="text-ui-fg-muted">
        Badge colours: green done, orange partly done, purple estimated, grey not started.
      </Text>
    </Container>
  )
}

export const config = defineRouteConfig({
  nested: "/products",
  label: "3D measurements",
  icon: tinted(ArrowsPointingOut, NAV_COLOR.catalog),
  rank: 34,
})

export default GarmentMeasurementsListPage
