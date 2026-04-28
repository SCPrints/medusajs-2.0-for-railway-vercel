import { Client } from "minio"
import { ulid } from "ulid"

import {
  MINIO_ACCESS_KEY,
  MINIO_BUCKET,
  MINIO_ENDPOINT,
  MINIO_SECRET_KEY,
} from "../../lib/constants"

const MAX_BYTES = 8 * 1024 * 1024

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
}

function parseMinioConfig() {
  if (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
    return null
  }

  let endPoint = MINIO_ENDPOINT
  let useSSL = true
  let port = 443

  if (endPoint.startsWith("https://")) {
    endPoint = endPoint.replace("https://", "")
    useSSL = true
    port = 443
  } else if (endPoint.startsWith("http://")) {
    endPoint = endPoint.replace("http://", "")
    useSSL = false
    port = 80
  }

  endPoint = endPoint.replace(/\/$/, "")
  const portMatch = endPoint.match(/:(\d+)$/)
  if (portMatch) {
    port = parseInt(portMatch[1], 10)
    endPoint = endPoint.replace(/:(\d+)$/, "")
  }

  return {
    endPoint,
    useSSL,
    port,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY,
    bucket: MINIO_BUCKET || "medusa-media",
  }
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

  const config = parseMinioConfig()
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

  const protocol = config.useSSL ? "https" : "http"
  return `${protocol}://${config.endPoint}/${config.bucket}/${key}`
}
