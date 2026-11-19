import { NextRequest } from "next/server"

import { proxyDownload } from "@lib/util/proxy-download"

// The zip is built file by file on the backend; a big job can take a while.
export const maxDuration = 300

/** GET /api/orders/:id/download-pack — one zip: tax invoice, proofs and artwork for the customer's own order. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyDownload(`/store/customers/me/orders/${encodeURIComponent(id)}/download-pack`, {
    failMessage: "We couldn't put your files together. Please try again.",
  })
}
