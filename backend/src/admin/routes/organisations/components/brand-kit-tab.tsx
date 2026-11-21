import { Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { readBrandKit, type BrandKit } from "../../../../lib/brand-kit"

/** Read-only: the owner edits the brand kit on the storefront's organisation page. */
export default function BrandKitTab({ organisationId }: { organisationId: string }) {
  const [kit, setKit] = useState<BrandKit | null>(null)
  useEffect(() => {
    let live = true
    fetch(`/admin/organisations/${organisationId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => live && setKit(readBrandKit(j?.organisation?.brand_kit)))
      .catch(() => live && setKit(null))
    return () => {
      live = false
    }
  }, [organisationId])

  if (!kit) return <Text size="small" className="text-ui-fg-subtle">Loading…</Text>
  const empty = !kit.colours.length && !kit.fonts.length && !kit.placement_notes && !kit.logo_artwork_ids.length
  return (
    <Container className="flex flex-col gap-y-4 p-4">
      <Heading level="h3">Brand kit</Heading>
      {empty ? <Text size="small" className="text-ui-fg-subtle">The organisation hasn&apos;t set one up yet.</Text> : null}
      {kit.colours.length ? (
        <div className="flex flex-wrap gap-3">
          {kit.colours.map((c) => (
            <div key={c.hex + c.name} className="flex items-center gap-2">
              <span className="size-6 rounded border border-ui-border-base" style={{ background: c.hex }} />
              <Text size="small">{c.name} {c.hex}{c.pantone ? ` · Pantone ${c.pantone}` : ""}</Text>
            </div>
          ))}
        </div>
      ) : null}
      {kit.fonts.length ? <Text size="small">Fonts: {kit.fonts.join(", ")}</Text> : null}
      {kit.placement_notes ? <Text size="small" className="whitespace-pre-wrap">{kit.placement_notes}</Text> : null}
      {kit.logo_artwork_ids.length ? (
        <Text size="small" className="text-ui-fg-subtle">Official logo files (artwork ids): {kit.logo_artwork_ids.join(", ")}</Text>
      ) : null}
    </Container>
  )
}
