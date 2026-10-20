import type { MedusaContainer } from "@medusajs/framework/types"

import {
  dimsWithinTolerance,
  embroideryDigitizingUnits,
  type SideEmbroideryConfig,
} from "./scp-decoration-pricing"

/**
 * Digitizing is charged on NEW artwork or a RESIZE of artwork (Sean,
 * 2026-10-20). The customizer's "embroidered this for you before" tick-box
 * is therefore a claim, not an input: the fee is waived only when one of
 * this customer's prior (non-cancelled) orders carries the same artwork at
 * the same size — the same (artworkKey, ±5% dims) identity the per-file
 * digitizing model already uses. Guests and unfingerprintable sides always
 * pay. Review 1-3.
 */

const objectOrEmpty = <T>(value: unknown): T =>
  (typeof value === "object" && value !== null ? value : {}) as T

/**
 * Pure: rewrite every embroidery side's includeDigitizingFee from the
 * prior-order metadata. Returns a new metadata object (shallow copies on
 * the path it touches); untouched when the line has no embroidery.
 */
export function decideDigitizingWaivers(
  metadata: Record<string, unknown>,
  priorLineMetadatas: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const current = embroideryDigitizingUnits(metadata, "line")
  if (current.length === 0) return metadata

  const prior = priorLineMetadatas.flatMap((m, i) =>
    embroideryDigitizingUnits(m ?? {}, `prior:${i}`).filter((e) => e.fingerprintable)
  )

  const customizerDesign = objectOrEmpty<Record<string, unknown>>(metadata.customizerDesign)
  const configs = { ...objectOrEmpty<Record<string, SideEmbroideryConfig>>(customizerDesign.sideEmbroideryConfigs) }
  for (const entry of current) {
    const waived =
      entry.fingerprintable &&
      prior.some((p) => p.artworkKey === entry.artworkKey && dimsWithinTolerance(p, entry))
    configs[entry.side] = { ...(configs[entry.side] ?? {}), includeDigitizingFee: !waived }
  }
  return {
    ...metadata,
    customizerDesign: { ...customizerDesign, sideEmbroideryConfigs: configs },
  }
}

/** The image sources a line's artwork keys are built from. */
const artworkSources = (metadata: Record<string, unknown>): string[] =>
  Array.from(
    new Set(
      embroideryDigitizingUnits(metadata, "line")
        .filter((e) => e.fingerprintable)
        .flatMap((e) => e.artworkKey.split("|"))
    )
  )

/**
 * Apply the waiver rule against the customer's order history. Fail-closed:
 * no customer, no embroidery, or a lookup error → every side pays.
 */
export async function applyDigitizingWaivers(
  container: MedusaContainer,
  customerId: string | null,
  metadata: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const sources = artworkSources(metadata)
  if (sources.length === 0) return decideDigitizingWaivers(metadata, [])
  if (!customerId) return decideDigitizingWaivers(metadata, [])

  let rows: Array<{ metadata: Record<string, unknown> | null }> = []
  try {
    const pg = container.resolve<any>("__pg_connection__")
    // Pre-filter in SQL on the upload URLs (rare match → few rows), then
    // decide in JS with the real clustering rule. Line metadata can be
    // multi-MB, so only rows that can match are pulled.
    const likes = sources.map((s) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    const result = await pg.raw(
      `select li.metadata
         from "order" o
         join order_item oi on oi.order_id = o.id and oi.deleted_at is null
         join order_line_item li on li.id = oi.item_id and li.deleted_at is null
        where o.deleted_at is null
          and o.canceled_at is null
          and o.customer_id = ?
          and li.metadata::text like any (array[${likes.map(() => "?").join(", ")}])
        limit 50`,
      [customerId, ...likes]
    )
    rows = result?.rows ?? []
  } catch {
    rows = []
  }
  return decideDigitizingWaivers(
    metadata,
    rows.map((r) => r.metadata)
  )
}
