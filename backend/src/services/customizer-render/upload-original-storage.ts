import { Client } from "minio"
import { ulid } from "ulid"

import { getMinioConfig } from "./service"

const MAX_BYTES = 8 * 1024 * 1024

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
}

/**
 * Persists the customer's upload byte-for-byte on object storage (same bucket as render outputs).
 */
export async function uploadCustomerOriginalFile(
  buffer: Buffer,
  mimeType: string,
  originalFileName: string
): Promise<string | null> {
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    throw new Error(`File size must be between 1 byte and ${MAX_BYTES} bytes.`)
  }

  const config = getMinioConfig()
  if (!config) {
    return null
  }

  const allowed = new Set(Object.keys(MIME_TO_EXT))
  if (!allowed.has(mimeType)) {
    throw new Error(`Unsupported mime type: ${mimeType}`)
  }

  const ext = MIME_TO_EXT[mimeType] ?? ".bin"
  const fileName = `customer-original-${ulid()}${ext}`

  const client = new Client({
    endPoint: config.endPoint,
    useSSL: config.useSSL,
    port: config.port,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  })

  const key = `customizer/${fileName}`

  await client.putObject(config.bucket, key, buffer, buffer.length, {
    "Content-Type": mimeType,
    "x-amz-acl": "public-read",
  })

  // Prefer the public CDN/R2 host. The S3 API endpoint (MINIO_ENDPOINT) on
  // Cloudflare R2 requires SigV4 auth and returns 400/401 to anonymous GETs,
  // so a customer-original stored under it cannot be fetched by the browser
  // canvas OR re-inlined by the backend render — the artwork rasterizes BLANK
  // (blank print PNG + artwork-less mockup). Mirrors uploadToMinio() in
  // service.ts, which already builds the public URL correctly.
  if (config.publicUrl) {
    return `${config.publicUrl}/${key}`
  }
  const protocol = config.useSSL ? "https" : "http"
  return `${protocol}://${config.endPoint}/${config.bucket}/${key}`
}
