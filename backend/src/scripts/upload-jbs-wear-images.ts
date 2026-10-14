/**
 * Upload JB's Wear garment shots from the Hightail pack (downloaded + unzipped
 * locally) to R2 as `jbs-wear/<STYLE>_<COLOUR>_front|back.jpg`, so the
 * customizer gets a front AND back per colour. Run this BEFORE
 * import-jbs-wear-from-xlsx — the importer prefers these R2 shots and falls
 * back to the jbswear.com.au front-only photo where none was uploaded.
 *
 * Runs locally (the pack is on your disk), writing to whatever bucket the
 * local .env's MINIO_* points at. Idempotent: objects that already exist are
 * skipped, so re-running after unzipping more of the pack only uploads the gap.
 *
 * Usage:
 *   JBS_XLSX_PATH=/abs/sku.xlsx JBS_IMAGES_DIR="/abs/JB Wear" [IMPORT_DRY_RUN=1] \
 *     npx medusa exec src/scripts/upload-jbs-wear-images.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Client } from "minio"
import * as XLSX from "xlsx"
import fs from "node:fs"
import path from "node:path"
import {
  groupJbsRows,
  jbsImageKey,
  normaliseHeader,
  type JbsRow,
} from "../lib/jbs-wear-catalog"

/** JB's ships some files as "1BT3_F1_01 copy.jpg" / ".JPG" — match loosely. */
const normName = (f: string) => path.basename(f).replace(/\s*copy\b/i, "").toUpperCase()

function indexImages(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) indexImages(p, out)
    else if (/\.jpe?g$/i.test(e.name) && !e.name.startsWith("._")) out.set(normName(e.name), p)
  }
  return out
}

export default async function uploadJbsWearImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const xlsxPath = process.env.JBS_XLSX_PATH
  const imagesDir = process.env.JBS_IMAGES_DIR
  if (!xlsxPath || !imagesDir) throw new Error("Set JBS_XLSX_PATH and JBS_IMAGES_DIR")
  const dryRun = ["1", "true"].includes(process.env.IMPORT_DRY_RUN ?? "")

  const wb = XLSX.readFile(xlsxPath)
  const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
  const headers = (raw[0] ?? []).map(normaliseHeader)
  const { styles } = groupJbsRows(
    raw.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r as unknown[])[i]])) as JbsRow)
  )
  const onDisk = indexImages(imagesDir)
  logger.info(`Indexed ${onDisk.size} images under ${imagesDir}.`)

  // One job per colourway × view, de-duplicated (every size repeats the colour).
  const jobs = new Map<string, string>() // key → local path
  const missing = new Set<string>()
  for (const s of styles) {
    for (const v of s.variants) {
      for (const [view, file] of [["front", v.hightailFront], ["back", v.hightailBack]] as const) {
        const key = jbsImageKey(s.code, v.colourCode, view)
        if (!file || jobs.has(key) || missing.has(key)) continue
        const local = onDisk.get(normName(file))
        if (local) jobs.set(key, local)
        else missing.add(key)
      }
    }
  }
  logger.info(`${jobs.size} shots to upload, ${missing.size} listed in the sheet but not on disk.`)
  if (dryRun) {
    logger.info(`Dry run — sample: ${[...jobs].slice(0, 3).map(([k, p]) => `${path.basename(p)} → ${k}`).join(", ")}`)
    return
  }

  const endpoint = (process.env.MINIO_ENDPOINT ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "")
  const bucket = process.env.MINIO_BUCKET || "medusa-media"
  if (!endpoint || !process.env.MINIO_ACCESS_KEY) throw new Error("MINIO_* env not set")
  const client = new Client({
    endPoint: endpoint,
    port: 443,
    useSSL: true,
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
  })

  let uploaded = 0
  let skipped = 0
  let failed = 0
  const entries = [...jobs]
  for (let i = 0; i < entries.length; i += 8) {
    await Promise.all(
      entries.slice(i, i + 8).map(async ([key, local]) => {
        try {
          const exists = await client.statObject(bucket, key).then(() => true, () => false)
          if (exists) return void skipped++
          await client.fPutObject(bucket, key, local, {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          })
          uploaded++
        } catch (err: any) {
          failed++
          logger.warn(`Upload failed ${key}: ${err?.message ?? err}`)
        }
      })
    )
    if ((i / 8) % 25 === 0) logger.info(`…${i + 8}/${entries.length}`)
  }
  logger.info(`JB's images: ${uploaded} uploaded, ${skipped} already there, ${failed} failed.`)
}
