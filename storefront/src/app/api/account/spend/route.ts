import { NextRequest } from "next/server"

import { proxyDownload } from "@lib/util/proxy-download"

/** GET /api/account/spend?format=csv|pdf[&organisation_id=…] — statement of invoices as a file. */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "pdf"
  const org = req.nextUrl.searchParams.get("organisation_id")
  return proxyDownload(
    `/store/customers/me/spend?format=${format}${org ? `&organisation_id=${encodeURIComponent(org)}` : ""}`,
    { failMessage: "We couldn't make your statement. Please try again." }
  )
}
