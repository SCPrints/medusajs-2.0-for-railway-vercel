/**
 * Staff-side destinations for a finished Studio design: the POS till, a quote
 * being built in admin, and the "price on application" embroidery request.
 * The Studio core builds the design (metadataBase); these send it. Messages,
 * window closing and analytics stay in the Studio.
 */
import { sanitizeCustomizerDesignForCart } from "../sanitize-cart-metadata"
import type { CustomizerMetadata } from "../types"
import {
  assertOk,
  designLine,
  type DesignCell,
  type DesignProduct,
  newQuoteGroupId,
  postJson,
  variantPriceCents,
} from "./lines"

type Common = {
  cells: DesignCell[]
  metadataBase: Omit<CustomizerMetadata, "variantId">
  hostedByDataUrl: Record<string, string>
  product: DesignProduct
  printSizeId: string
}

/** POS: one bridge call per line, each carrying its own design; garment price as the default. */
export async function sendToPos(input: Common & { sessionId: string }): Promise<void> {
  for (const cell of input.cells) {
    const design = sanitizeCustomizerDesignForCart(
      { ...input.metadataBase, variantId: cell.variant.id },
      input.hostedByDataUrl
    )
    const line = designLine({
      cell,
      product: input.product,
      printSizeId: input.printSizeId,
      unitPriceCents: variantPriceCents(cell),
      metadata: { customizerDesign: design },
    })
    await assertOk(
      await postJson("/api/pos-bridge/items", { pos_session_id: input.sessionId, ...line }),
      "POS bridge failed"
    )
  }
}

/**
 * Quote: all lines in ONE request with a shared group id, so re-editing
 * replaces the group. The design is sent once at the top level (the backend
 * fans it out per line) — per-line copies of heavy vector art blew the body
 * caps. Direct to the backend (Vercel's relay caps bodies at ~4.5 MB), relay
 * only as a fallback. The backend re-prices lines; ours is the suggestion.
 */
export async function sendToQuote(
  input: Common & {
    quoteId: string
    qsig: string
    groupId?: string | null
    /** Decorated unit price shown in the Studio, in DOLLARS (pricing.discountedUnitPriceCents is dollars). */
    decoratedUnitDollars?: number | null
    backendUrl?: string
    publishableKey?: string
  }
): Promise<void> {
  const decoratedCents =
    Number.isFinite(input.decoratedUnitDollars) && (input.decoratedUnitDollars ?? 0) > 0
      ? Math.round((input.decoratedUnitDollars as number) * 100)
      : null
  const payload = JSON.stringify({
    quote_id: input.quoteId,
    qsig: input.qsig,
    group_id: input.groupId || newQuoteGroupId(),
    design: sanitizeCustomizerDesignForCart(input.metadataBase as CustomizerMetadata, input.hostedByDataUrl),
    lines: input.cells.map((cell) =>
      designLine({
        cell,
        product: input.product,
        printSizeId: input.printSizeId,
        unitPriceCents: decoratedCents ?? variantPriceCents(cell),
      })
    ),
  })
  const base = (input.backendUrl ?? "").replace(/\/+$/, "")
  let res: Response
  try {
    if (!base) throw new Error("no backend url")
    res = await postJson(
      `${base}/store/quotes/${encodeURIComponent(input.quoteId)}/design-items`,
      payload,
      input.publishableKey ? { "x-publishable-api-key": input.publishableKey } : {}
    )
  } catch {
    res = await postJson("/api/quote-bridge/items", payload)
  }
  await assertOk(res, "Quote bridge failed")
}

/** Price on application: send the design to staff as a quote request (no prices). Returns its public id. */
export async function sendPoaRequest(
  input: Common & {
    contact: { email: string; phone: string; name?: string; note?: string }
    poaSides: Array<{ side: string; stitch_count: number }>
  }
): Promise<{ publicId: string | null }> {
  const lines = input.cells.map((cell) =>
    designLine({
      cell,
      product: input.product,
      printSizeId: input.printSizeId,
      unitPriceCents: null,
      metadata: {
        customizerDesign: sanitizeCustomizerDesignForCart(
          { ...input.metadataBase, variantId: cell.variant.id },
          input.hostedByDataUrl
        ),
      },
    })
  )
  const body = await assertOk(
    await postJson("/api/quote-bridge/poa", {
      email: input.contact.email,
      contact_phone: input.contact.phone,
      contact_name: input.contact.name || undefined,
      note: input.contact.note || undefined,
      group_id: newQuoteGroupId(),
      product_title: input.product.title ?? undefined,
      poa_sides: input.poaSides,
      lines,
    }),
    "Quote request failed"
  )
  return { publicId: body?.public_id ?? null }
}
