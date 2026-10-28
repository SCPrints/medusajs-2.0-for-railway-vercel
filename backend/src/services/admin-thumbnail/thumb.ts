import { createHash } from "crypto"
import sharp from "sharp"
import { Client } from "minio"
import { MINIO_PUBLIC_URL } from "../../lib/constants"
import { getMinioConfig, rewriteOwnR2UrlToPublic } from "../customizer-render/service"

/**
 * Small previews for the admin's hover boxes (line-item mockup / artwork /
 * print-file buttons). Customer originals are 600 dpi PNGs (~9000×11000 px,
 * tens of MB), far too slow to show on hover, so each file gets a ~480 px webp
 * made once and kept on R2 at `thumbs/<hash>.webp`. Source keys carry a ULID,
 * so a URL never changes content and its hash is a safe cache key.
 */
const THUMB_EDGE = 480
const SOURCE_MAX_BYTES = 150 * 1024 * 1024

const publicBase = () => MINIO_PUBLIC_URL?.replace(/\/+$/, "") || null

/** Our own R2 file (public or private-endpoint form) → its public URL, else null. */
export const ownR2PublicUrl = (raw: string): string | null => {
  const base = publicBase()
  if (!base || typeof raw !== "string") return null
  const url = rewriteOwnR2UrlToPublic(raw.trim())
  if (!url.startsWith(`${base}/`) || url.includes("..")) return null
  // Never thumbnail a thumbnail.
  if (url.startsWith(`${base}/thumbs/`)) return null
  return url
}

export const thumbKeyFor = (publicUrl: string) =>
  `thumbs/${createHash("sha256").update(publicUrl).digest("hex").slice(0, 32)}.webp`

// ponytail: per-machine memory caches; a restart just re-checks R2 with one HEAD.
const known = new Set<string>()
const failed = new Map<string, number>()
const FAILED_TTL_MS = 10 * 60 * 1000
const inflight = new Map<string, Promise<Buffer | null>>()
// One decode at a time: a 600 dpi PNG is ~400 MB decoded, and concurrent
// decodes OOM-killed the 4 GB machine on 2026-10-28.
let queue: Promise<unknown> = Promise.resolve()

const existsOnR2 = async (url: string) => {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5_000) })
    return res.ok
  } catch {
    return false
  }
}

const generate = async (sourceUrl: string, key: string): Promise<Buffer | null> => {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) return null
  const len = Number(res.headers.get("content-length") ?? 0)
  if (len > SOURCE_MAX_BYTES) return null
  const source = Buffer.from(await res.arrayBuffer())
  if (source.length > SOURCE_MAX_BYTES) return null

  const thumb = await sharp(source, { sequentialRead: true, limitInputPixels: 300_000_000 })
    .rotate()
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer()

  const config = getMinioConfig()
  if (config) {
    const client = new Client({
      endPoint: config.endPoint,
      useSSL: config.useSSL,
      port: config.port,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    })
    try {
      await client.putObject(config.bucket, key, thumb, thumb.length, {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      })
      known.add(key)
    } catch {
      // Storing failed: still serve this one; the next view tries again.
    }
  }
  return thumb
}

export type ThumbResult =
  | { kind: "redirect"; url: string }
  | { kind: "bytes"; body: Buffer }
  | { kind: "unavailable" }

export const getThumbnail = async (sourcePublicUrl: string): Promise<ThumbResult> => {
  const key = thumbKeyFor(sourcePublicUrl)
  const thumbUrl = `${publicBase()}/${key}`

  if (known.has(key)) return { kind: "redirect", url: thumbUrl }
  const failedAt = failed.get(key)
  if (failedAt && Date.now() - failedAt < FAILED_TTL_MS) return { kind: "unavailable" }

  let job = inflight.get(key)
  if (!job) {
    job = (async () => {
      if (await existsOnR2(thumbUrl)) {
        known.add(key)
        return null
      }
      const run = queue.then(() => generate(sourcePublicUrl, key))
      queue = run.catch(() => undefined)
      return run
    })()
      .catch(() => null)
      .finally(() => inflight.delete(key))
    inflight.set(key, job)
  }

  const bytes = await job
  if (known.has(key) && !bytes) return { kind: "redirect", url: thumbUrl }
  if (bytes) return { kind: "bytes", body: bytes }
  // Not an image sharp can read (PDF, AI, EPS…), or the source is gone.
  failed.set(key, Date.now())
  return { kind: "unavailable" }
}
