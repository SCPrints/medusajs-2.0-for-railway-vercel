import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getThumbnail, ownR2PublicUrl } from "../../../services/admin-thumbnail/thumb"

/**
 * GET /admin/thumbnail?url=<our R2 file>
 *
 * ~480 px webp preview for the admin hover boxes. Redirects to the copy kept on
 * R2, making it on first request. Only our own R2 files are accepted.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const source = ownR2PublicUrl(String(req.query.url ?? ""))
  if (!source) {
    res.status(400).json({ message: "Only SC Prints file URLs can be previewed." })
    return
  }

  const result = await getThumbnail(source)
  if (result.kind === "unavailable") {
    res.status(415).json({ message: "No preview for this file." })
    return
  }
  // Source files never change (ULID keys), so browsers may keep the answer.
  res.setHeader("Cache-Control", "private, max-age=604800, immutable")
  if (result.kind === "redirect") {
    res.redirect(302, result.url)
    return
  }
  res.setHeader("Content-Type", "image/webp")
  res.status(200).send(result.body)
}
