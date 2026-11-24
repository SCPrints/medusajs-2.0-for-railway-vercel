import { proxyDownload } from "@lib/util/proxy-download"

/** GET /api/account/supplier-pack — our supplier details PDF for the signed-in customer's accounts team. */
export async function GET() {
  return proxyDownload("/store/customers/me/documents/supplier-pack", {
    failMessage: "We couldn't make the supplier details. Please try again.",
  })
}
