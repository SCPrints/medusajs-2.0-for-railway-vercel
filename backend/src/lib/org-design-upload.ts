import { MedusaRequest } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB ceiling for thumbnail + print file

const fileService = (req: MedusaRequest) =>
  req.scope.resolve(Modules.FILE) as unknown as {
    createFiles: (
      data: { filename: string; mimeType: string; content: string }[]
    ) => Promise<Array<{ id: string; url: string }>>
  }

/**
 * Decode a base64 thumbnail upload, size-check it (≤8 MB), and persist it via
 * the file module. Shared by the org create + update design routes.
 */
export async function uploadOrgDesignFile(
  req: MedusaRequest,
  upload: { data_base64: string; filename: string; mime_type: string },
  pathPrefix: string
): Promise<string> {
  const base64 = upload.data_base64.replace(/^data:[^;]+;base64,/, "")
  const buffer = Buffer.from(base64, "base64")
  if (buffer.byteLength === 0) throw new Error("Empty upload payload")
  if (buffer.byteLength > MAX_BYTES) throw new Error("File exceeds 8 MB limit")
  const safeName = `${pathPrefix}/${Date.now()}-${upload.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  const uploaded = await fileService(req).createFiles([
    { filename: safeName, mimeType: upload.mime_type, content: base64 },
  ])
  const url = uploaded?.[0]?.url
  if (!url) throw new Error("Upload returned no URL")
  return url
}
