import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { getPostHog } from "../../../../lib/posthog"

/**
 * POST /store/contact/attachments
 *
 * Stores a single contact-form attachment (artwork, brief, reference) on object
 * storage and returns its public URL. The browser uploads here DIRECTLY (with
 * the publishable key) so large print-ready files bypass the storefront's
 * Vercel proxy ~4.5MB body cap — same pattern as /store/customizer/upload-original.
 * The returned URL is later attached to the contact submission, which validates
 * it points at our bucket before emailing staff.
 */

// Decoded-size ceiling per file. base64 inflates ~1.33x, so the route's body
// limit in middlewares.ts ("32mb") covers this with headroom.
const MAX_BYTES = 20 * 1024 * 1024

// Artwork is validated by FILE EXTENSION, not mime type: browsers frequently
// report design files (.ai / .eps / .psd) as application/octet-stream or "" so a
// mime allowlist would reject legitimate print-ready files. The extension is the
// reliable signal; the mime type is stored best-effort for the eventual download.
const ALLOWED_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "tif",
  "tiff",
  "pdf",
  "ai",
  "eps",
  "ps",
  "psd",
  "zip",
])

const bodySchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(150).optional(),
  /** Raw file bytes, base64-encoded (no `data:` prefix). */
  dataBase64: z.string().min(1),
})

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot >= 0 ? name.slice(dot + 1).toLowerCase().trim() : ""
}

function sanitizeFileName(name: string): string {
  // Drop any path components + collapse unsafe chars; keep it readable.
  const base = name.split(/[\\/]/).pop() || "upload"
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "upload"
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid contact-attachment payload: ${parsed.error.issues.map((i) => i.message).join(", ")}`
    )
  }

  const ext = fileExtension(parsed.data.fileName)
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Unsupported file type ".${ext || "?"}". Allowed: images, PDF, AI, EPS, PSD, ZIP.`
    )
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(parsed.data.dataBase64, "base64")
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid base64 payload.")
  }
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `File must be between 1 byte and ${Math.floor(MAX_BYTES / (1024 * 1024))} MB.`
    )
  }

  const safeName = sanitizeFileName(parsed.data.fileName)
  const mimeType = parsed.data.mimeType?.trim() || "application/octet-stream"

  let url: string | undefined
  try {
    const fileModuleService = req.scope.resolve(Modules.FILE) as unknown as {
      createFiles: (
        data: { filename: string; mimeType: string; content: string }[]
      ) => Promise<Array<{ id: string; url: string }>>
    }
    // `contact-` prefix survives the file provider's path.parse + ULID rename so
    // staff can recognise contact-form uploads in the bucket.
    const [uploaded] = await fileModuleService.createFiles([
      {
        filename: `contact-${safeName}`,
        mimeType,
        content: parsed.data.dataBase64,
      },
    ])
    url = uploaded?.url
  } catch (error) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Failed to store contact attachment: ${error instanceof Error ? error.message : "unknown error"}`
    )
  }

  if (!url) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "File storage is not configured (MinIO / R2 env missing)."
    )
  }

  const distinctId = (req as any).auth_context?.actor_id ?? "anonymous"
  getPostHog()?.capture({
    distinctId,
    event: "contact attachment uploaded",
    properties: {
      file_name: safeName,
      mime_type: mimeType,
      bytes: buffer.length,
    },
  })

  return res.status(200).json({
    success: true,
    url,
    fileName: parsed.data.fileName,
    mimeType,
    bytes: buffer.length,
  })
}
