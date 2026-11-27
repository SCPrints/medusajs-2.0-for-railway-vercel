import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Client } from "minio"

import {
  MINIO_ACCESS_KEY,
  MINIO_BUCKET,
  MINIO_ENDPOINT,
  MINIO_SECRET_KEY,
} from "../../../../lib/constants"

/**
 * GET /admin/reports/storage
 *
 * Walks the configured MinIO bucket once and returns total bytes +
 * object count. The customizer's "My Designs" library + customer
 * original-file archive grow forever — visibility on the size means the
 * bill doesn't surprise. Optional query: `?prefix=customizer/` to scope.
 *
 * The walk is bounded at 100k objects defensively. If you cross that,
 * graduate this report to a daily snapshot job written to its own table
 * (the trend would matter at that scale anyway).
 */
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

const HARD_OBJECT_CAP = 100_000

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const logger = (req.scope as any).resolve?.("logger") ?? console
  const config = parseMinioConfig()
  if (!config) {
    return res.json({
      configured: false,
      total_bytes: 0,
      object_count: 0,
      bucket: null,
      prefix: null,
      capped: false,
    })
  }

  const prefix =
    typeof req.query.prefix === "string" && req.query.prefix.length > 0
      ? req.query.prefix
      : ""

  // The walk lists every object (tens of thousands: 17–34 s on 27 Nov 2026)
  // and the Reports page asks on every visit, so keep each answer for an
  // hour and share one walk between requests that arrive together. A failed
  // walk isn't kept.
  const key = `${config.bucket}|${prefix}`
  let entry = walks.get(key)
  if (!entry || Date.now() - entry.at > WALK_TTL_MS) {
    const fresh = { at: Date.now(), walk: walkBucket(config, prefix) }
    walks.set(key, fresh)
    fresh.walk.catch(() => {
      if (walks.get(key) === fresh) walks.delete(key)
    })
    entry = fresh
  }

  let walk: Walk
  try {
    walk = await entry.walk
  } catch (err: any) {
    logger.warn?.(`[storage] MinIO list failed: ${err?.message ?? err}`)
    return res.status(502).json({
      configured: true,
      error: "MinIO list failed",
      detail: String(err?.message ?? err),
    })
  }

  return res.json({
    configured: true,
    bucket: config.bucket,
    prefix: prefix || null,
    ...walk,
  })
}

type Walk = {
  total_bytes: number
  object_count: number
  capped: boolean
  prefixes: Array<{ prefix: string; bytes: number; count: number }>
}

const WALK_TTL_MS = 60 * 60 * 1000
const walks = new Map<string, { at: number; walk: Promise<Walk> }>()

async function walkBucket(
  config: NonNullable<ReturnType<typeof parseMinioConfig>>,
  prefix: string
): Promise<Walk> {
  const client = new Client({
    endPoint: config.endPoint,
    useSSL: config.useSSL,
    port: config.port,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  })

  let totalBytes = 0
  let objectCount = 0
  let capped = false
  type PrefixStat = { bytes: number; count: number }
  const byPrefix = new Map<string, PrefixStat>()

  const stream = client.listObjectsV2(config.bucket, prefix, true)
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (item: any) => {
      if (objectCount >= HARD_OBJECT_CAP) {
        capped = true
        return
      }
      const size = Number(item?.size ?? 0)
      if (Number.isFinite(size)) totalBytes += size
      objectCount += 1
      const name = String(item?.name ?? "")
      const topPrefix = name.split("/")[0] || "(root)"
      const stat = byPrefix.get(topPrefix) ?? { bytes: 0, count: 0 }
      stat.bytes += size
      stat.count += 1
      byPrefix.set(topPrefix, stat)
    })
    stream.on("end", () => resolve())
    stream.on("error", (err: any) => reject(err))
  })

  const prefixes = Array.from(byPrefix.entries())
    .map(([prefix, stat]) => ({
      prefix,
      bytes: stat.bytes,
      count: stat.count,
    }))
    .sort((a, b) => b.bytes - a.bytes)

  return { total_bytes: totalBytes, object_count: objectCount, capped, prefixes }
}
