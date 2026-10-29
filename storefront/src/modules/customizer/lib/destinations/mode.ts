/**
 * Where a Studio session saves to, read once from the URL, and the rules that
 * differ per destination (button labels, which checks apply). Change a flow's
 * behaviour here, not with inline mode checks in the Studio.
 *
 *   proof  `?adminProof=<orderId>:<lineItemId>:<side>` — staff reposition artwork for an order proof
 *   pos    `?pos_session=<id>` — staff add a design to a till sale
 *   quote  `?quote_id=<id>&qsig=<sig>` — staff design lines for a quote
 *   shop   everything else — the customer's cart
 */
export type StudioDestination =
  | {
      kind: "proof"
      orderId: string
      lineItemId: string
      side: string
      /** Raw `proofArtwork` param (still URI-encoded by the admin). */
      artworkParam: string | null
    }
  | { kind: "pos"; sessionId: string }
  | { kind: "quote"; quoteId: string; qsig: string; groupId: string | null; seed: string | null }
  | { kind: "shop" }

type Params = { get(name: string): string | null } | null | undefined

/** First match wins, in the order the Studio's save path checks them. */
export function readDestination(params: Params): StudioDestination {
  const [orderId, lineItemId, side] = (params?.get("adminProof") ?? "").split(":")
  if (orderId && lineItemId && side) {
    return { kind: "proof", orderId, lineItemId, side, artworkParam: params?.get("proofArtwork") ?? null }
  }
  const sessionId = params?.get("pos_session")
  if (sessionId) return { kind: "pos", sessionId }
  const quoteId = params?.get("quote_id")
  const qsig = params?.get("qsig")
  if (quoteId && qsig) {
    return { kind: "quote", quoteId, qsig, groupId: params?.get("group") ?? null, seed: params?.get("seed") ?? null }
  }
  return { kind: "shop" }
}

/**
 * Screen printing needs a minimum run. Quotes skip it: staff quote a small
 * colourway that rides a larger run's screens and confirm the price anyway.
 */
export const enforcesScreenMinimum = (d: StudioDestination) => d.kind !== "quote"

/**
 * Embroidery over the auto-priced stitch cap prices at $0, so it can't go to
 * a cart or a sale.
 *   allow          quote: staff price it on the quote
 *   use_quote      pos: tell staff to quote it instead
 *   cannot_edit    shop, editing an existing cart line: can't become a quote request
 *   request_quote  shop: send the design to staff as a quote request
 */
export function overStitchCapAction(
  d: StudioDestination,
  state: { editingCart: boolean }
): "allow" | "use_quote" | "cannot_edit" | "request_quote" {
  if (d.kind === "quote" || d.kind === "proof") return "allow"
  if (d.kind === "pos") return "use_quote"
  return state.editingCart ? "cannot_edit" : "request_quote"
}

/** Main button label and its busy label; undefined = the pricing panel's default ("Add to cart"). */
export function submitLabels(
  d: StudioDestination,
  state: { editingCartLine: boolean; needsQuote: boolean }
): { label?: string; busy?: string } {
  if (d.kind === "quote") return { label: "Add design to quote", busy: "Saving to quote…" }
  if (d.kind === "pos") return { label: "Add to sale", busy: "Adding…" }
  if (state.editingCartLine) return { label: "Update cart", busy: "Updating..." }
  if (state.needsQuote) return { label: "Request a quote", busy: "Sending…" }
  return {}
}
