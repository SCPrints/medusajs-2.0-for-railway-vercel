import { NextRequest } from "next/server"

import { proxyDownload } from "@lib/util/proxy-download"

/** GET /api/account/prices?format=csv|pdf — the signed-in customer's price list as a file. */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "pdf"
  return proxyDownload(`/store/customers/me/prices?format=${format}`, {
    failMessage: "We couldn't make your price list. Please try again.",
  })
}
