import { getCartId } from "@lib/data/cookies"
import { leadRelayHeaders } from "@lib/util/lead-relay"
import { proxyDownload } from "@lib/util/proxy-download"

/**
 * GET /api/cart/quote-pdf — the cart's "Download a quote" PDF.
 *
 * The cart id comes from the cookie, never the client. The backend only takes
 * this from our relay (x-scp-relay), saves the cart as a quote for staff to
 * see, and emails nobody. No BotID check: a file download can't carry the
 * token, and it needs a real cart anyway.
 */
export async function GET() {
  const cartId = await getCartId()
  if (!cartId) return new Response("Your cart has expired. Please add your items again.", { status: 404 })
  return proxyDownload(`/store/carts/${encodeURIComponent(cartId)}/quote-pdf`, {
    method: "POST",
    headers: await leadRelayHeaders({ botCheck: false }),
    failMessage: "We couldn't make your quote. Please try again.",
  })
}
