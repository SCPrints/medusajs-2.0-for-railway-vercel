import sharp from "sharp"
import { ulid } from "ulid"
import { Client } from "minio"
import { MedusaError } from "@medusajs/framework/utils"
import {
  BACKEND_URL,
  MINIO_ACCESS_KEY,
  MINIO_BUCKET,
  MINIO_ENDPOINT,
  MINIO_SECRET_KEY,
} from "../../lib/constants"
import { RenderRequestPayload } from "./types"

const DEFAULT_MOCKUP_SIZE = {
  width: 1200,
  height: 1500,
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
]

const clampDimension = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.floor(value)))

const isPrivateHost = (host: string) => PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))

export const validateGarmentImageUrl = (value: string) => {
  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Garment image URL is invalid.")
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only HTTP(S) garment image URLs are allowed."
    )
  }

  const host = parsed.hostname.toLowerCase()
  /** Local dev uses same-origin garment URLs (e.g. localhost sleeve placeholders); production should use public CDN URLs. */
  const isProduction = process.env.NODE_ENV === "production"
  const explicitPrivateOk =
    String(process.env.CUSTOMIZER_ALLOW_PRIVATE_GARMENT_URLS ?? "")
      .trim()
      .toLowerCase() === "true"
  const allowPrivateGarmentUrls = explicitPrivateOk || !isProduction

  if (!allowPrivateGarmentUrls && isPrivateHost(host)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Private or local network garment image URLs are not allowed."
    )
  }

  const allowedHosts = (process.env.CUSTOMIZER_GARMENT_IMAGE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  if (allowedHosts.length && !allowedHosts.includes(host)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Garment image host is not in the allowed list."
    )
  }

  return parsed.toString()
}

export const rethrowIfMedusaError = (error: unknown) => {
  if (
    error instanceof MedusaError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "MedusaError" &&
      typeof (error as { message?: unknown }).message === "string")
  ) {
    throw error
  }
}

const getMinioConfig = () => {
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

const uploadToMinio = async (buffer: Buffer, fileName: string, mimeType: string) => {
  const config = getMinioConfig()
  if (!config) {
    return null
  }

  const client = new Client({
    endPoint: config.endPoint,
    useSSL: config.useSSL,
    port: config.port,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  })

  const key = `customizer/${fileName}`
  try {
    await client.putObject(config.bucket, key, buffer, buffer.length, {
      "Content-Type": mimeType,
      "x-amz-acl": "public-read",
    })
  } catch {
    // Storage misconfiguration should not block add-to-cart in local/dev flows.
    // Callers already fall back to compact inline data URLs when this returns null.
    return null
  }

  const protocol = config.useSSL ? "https" : "http"
  return `${protocol}://${config.endPoint}/${config.bucket}/${key}`
}

const dataUrlFromBuffer = (buffer: Buffer, mimeType: string) =>
  `data:${mimeType};base64,${buffer.toString("base64")}`

export const renderPrintAsset = async (payload: RenderRequestPayload) => {
  const width = clampDimension(payload.placement.width, 400, 4000)
  const height = clampDimension(payload.placement.height, 400, 4000)
  const svgBuffer = Buffer.from(payload.artworkSvg)
  const pngBuffer = await sharp(svgBuffer)
    .resize({
      width,
      height,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer()

  const fileName = `print-${payload.side}-${ulid()}.png`
  const minioUrl = await uploadToMinio(pngBuffer, fileName, "image/png")

  return {
    url: minioUrl ?? dataUrlFromBuffer(pngBuffer, "image/png"),
    bytes: pngBuffer.length,
    width,
    height,
  }
}

export const renderMockupAsset = async (payload: RenderRequestPayload) => {
  const placementWidth = clampDimension(payload.placement.width, 240, 2200)
  const placementHeight = clampDimension(payload.placement.height, 240, 2200)
  const artworkSvgBuffer = Buffer.from(payload.artworkSvg)

  let garmentBase: Buffer
  if (payload.garmentImageUrl) {
    try {
      const garmentImageUrl = validateGarmentImageUrl(payload.garmentImageUrl)
      const response = await fetch(garmentImageUrl)
      if (!response.ok) {
        throw new Error(`Garment source returned ${response.status}`)
      }

      const contentType = response.headers.get("content-type") ?? ""
      if (!contentType.startsWith("image/")) {
        throw new Error("Garment source did not return an image payload")
      }

      const arrayBuffer = await response.arrayBuffer()
      garmentBase = Buffer.from(arrayBuffer)
    } catch (error) {
      rethrowIfMedusaError(error)

      garmentBase = await sharp({
        create: {
          width: DEFAULT_MOCKUP_SIZE.width,
          height: DEFAULT_MOCKUP_SIZE.height,
          channels: 4,
          background: "#f3f4f6",
        },
      })
        .png()
        .toBuffer()
    }
  } else {
    garmentBase = await sharp({
      create: {
        width: DEFAULT_MOCKUP_SIZE.width,
        height: DEFAULT_MOCKUP_SIZE.height,
        channels: 4,
        background: "#f3f4f6",
      },
    })
      .png()
      .toBuffer()
  }

  const garmentMeta = await sharp(garmentBase).metadata()
  const mockupWidth = garmentMeta.width ?? DEFAULT_MOCKUP_SIZE.width
  const mockupHeight = garmentMeta.height ?? DEFAULT_MOCKUP_SIZE.height

  const left = clampDimension(payload.placement.x, 0, mockupWidth - 1)
  const top = clampDimension(payload.placement.y, 0, mockupHeight - 1)
  const maxCompositeWidth = Math.max(1, mockupWidth - left)
  const maxCompositeHeight = Math.max(1, mockupHeight - top)
  const artworkWidth = Math.min(placementWidth, maxCompositeWidth)
  const artworkHeight = Math.min(placementHeight, maxCompositeHeight)

  const artwork = await sharp(artworkSvgBuffer)
    .resize({
      width: artworkWidth,
      height: artworkHeight,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  const mockupBuffer = await sharp(garmentBase)
    .resize({
      width: mockupWidth,
      height: mockupHeight,
      fit: "cover",
    })
    .composite([
      {
        input: artwork,
        left,
        top,
      },
    ])
    .jpeg({ quality: 82 })
    .toBuffer()

  const fileName = `mockup-${payload.side}-${ulid()}.jpg`
  const minioUrl = await uploadToMinio(mockupBuffer, fileName, "image/jpeg")

  return {
    url: minioUrl ?? dataUrlFromBuffer(mockupBuffer, "image/jpeg"),
    bytes: mockupBuffer.length,
    width: mockupWidth,
    height: mockupHeight,
    source: BACKEND_URL,
  }
}
