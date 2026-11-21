import { Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

import type { ProofPin } from "../../../lib/proof-pins"

type Mockup = { side: string; side_label?: string | null; url: string }
type Proof = {
  artwork_stage: string | null
  artwork_approver_name: string | null
  artwork_approved_at: string | null
  mockup_urls: Mockup[]
  latest_photo_url: string | null
  change_pins: ProofPin[]
  change_comment: string | null
}

/**
 * What the customer marked on the proof when they asked for changes (numbered
 * pins over the image, notes listed under it), plus who signed it off.
 */
export function ProofPins({ orderId }: { orderId: string }) {
  const [proof, setProof] = useState<Proof | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/admin/orders/${encodeURIComponent(orderId)}/proof-pins`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setProof(j))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [orderId])

  if (!proof) return null
  const pins = proof.change_pins ?? []
  const images: Mockup[] = proof.mockup_urls?.length
    ? proof.mockup_urls
    : proof.latest_photo_url
      ? [{ side: "proof", side_label: "Proof", url: proof.latest_photo_url }]
      : []
  const signedOff =
    proof.artwork_stage === "approved" && proof.artwork_approver_name
      ? `Approved by ${proof.artwork_approver_name}`
      : null
  if (pins.length === 0 && !signedOff) return null

  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      {signedOff ? <Text size="small" weight="plus">{signedOff}</Text> : null}
      {pins.length > 0 ? (
        <>
          <Text size="small" weight="plus">
            Customer marked {pins.length} spot{pins.length === 1 ? "" : "s"} on the last proof
          </Text>
          {proof.change_comment ? <Text size="small" className="text-ui-fg-subtle">{proof.change_comment}</Text> : null}
          {images.map((img, i) => {
            const mine = pins.map((p, n) => ({ ...p, n: n + 1 })).filter((p) => p.image_index === i)
            if (mine.length === 0) return null
            return (
              <div key={img.url} className="max-w-md">
                <Text size="xsmall" className="mb-1 text-ui-fg-subtle">{img.side_label ?? img.side}</Text>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.side_label ?? img.side} className="w-full rounded-md border border-ui-border-base" />
                  {mine.map((p) => (
                    <span
                      key={p.n}
                      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                      className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ui-tag-red-icon text-xs font-semibold text-white"
                    >
                      {p.n}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
          <ol className="list-decimal pl-5">
            {pins.map((p, n) => (
              <li key={n}><Text size="small">{p.note || "(no note)"}</Text></li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  )
}
