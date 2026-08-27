import { Modules } from "@medusajs/framework/utils"
import { ulid } from "ulid"

/**
 * Write-time archiving for heavy `CustomizerMetadata.sideLayouts`.
 *
 * Vector Studio designs serialise Fabric path data to multi-MB JSON. Stored
 * inline per quote/cart/order line, one quote's `line_items` jsonb hit 19MB —
 * 413'd bridges, OOM'd the backend parsing it, and made the admin Kanban
 * minutes-slow. Production only needs the rendered `artifacts[]` URLs;
 * sideLayouts exists solely so the Studio can re-edit the design.
 *
 * So: designs whose serialized sideLayouts exceed the threshold are uploaded
 * to R2 as JSON and replaced with `sideLayouts_archived_url`. Read paths that
 * genuinely need the layouts (Studio re-edit GET, reorder rehydration) call
 * `restoreSideLayouts` to re-inline from the archive.
 *
 * Small designs stay inline — no behaviour change, no extra fetch hop, and
 * embroidery artwork fingerprinting (scp-decoration-pricing) keeps working.
 * Both helpers soft-fail: a broken upload keeps the bloated-but-working
 * inline shape; a broken restore returns the design without layouts (blank
 * canvas on re-edit, everything else unaffected).
 */
const ARCHIVE_THRESHOLD_BYTES = 256 * 1024

type DesignRecord = Record<string, unknown>

export async function archiveSideLayoutsIfLarge(
  scope: { resolve: (key: string) => unknown },
  design: DesignRecord,
  keyHint: string
): Promise<DesignRecord> {
  const sideLayouts = design?.sideLayouts
  if (!Array.isArray(sideLayouts) || sideLayouts.length === 0) return design

  const json = JSON.stringify(sideLayouts)
  if (Buffer.byteLength(json, "utf8") <= ARCHIVE_THRESHOLD_BYTES) return design

  try {
    const fileModule = scope.resolve(Modules.FILE) as {
      createFiles: (
        files: Array<{ filename: string; mimeType: string; content: string }>
      ) => Promise<Array<{ url?: string }>>
    }
    const safeHint = keyHint.replace(/[^a-zA-Z0-9._-]/g, "_")
    const [uploaded] = await fileModule.createFiles([
      {
        filename: `design-layouts/${safeHint}/${ulid()}.json`,
        mimeType: "application/json",
        content: Buffer.from(json, "utf8").toString("base64"),
      },
    ])
    if (!uploaded?.url) return design
    return { ...design, sideLayouts: [], sideLayouts_archived_url: uploaded.url }
  } catch (err) {
    console.error(
      `side-layouts-archive: upload failed for ${keyHint}; keeping inline`,
      err
    )
    return design
  }
}

export async function restoreSideLayouts(
  design: DesignRecord
): Promise<DesignRecord> {
  const inline = design?.sideLayouts
  if (Array.isArray(inline) && inline.length > 0) return design

  const url = design?.sideLayouts_archived_url
  if (typeof url !== "string" || !url) return design

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!resp.ok) return design
    const parsed: unknown = await resp.json()
    // Accept both the raw array and a wrapped { sideLayouts } object (the
    // 2026-08-25 one-off ALS archive predates this module).
    const layouts = Array.isArray(parsed)
      ? parsed
      : (parsed as { sideLayouts?: unknown })?.sideLayouts
    if (!Array.isArray(layouts)) return design
    return { ...design, sideLayouts: layouts }
  } catch (err) {
    console.error(`side-layouts-archive: restore failed for ${url}`, err)
    return design
  }
}

/**
 * Archive every line's `customizerDesign` in place, deduping identical
 * layout payloads (N size lines of one design share one archived object).
 */
export async function archiveLineDesigns(
  scope: { resolve: (key: string) => unknown },
  lines: Array<{ customizerDesign?: unknown } & Record<string, unknown>>,
  keyHint: string
): Promise<void> {
  const urlByPayload = new Map<string, string>()
  for (const line of lines) {
    const design = line.customizerDesign
    if (!design || typeof design !== "object") continue
    const sideLayouts = (design as DesignRecord).sideLayouts
    if (!Array.isArray(sideLayouts) || sideLayouts.length === 0) continue
    const json = JSON.stringify(sideLayouts)
    if (Buffer.byteLength(json, "utf8") <= ARCHIVE_THRESHOLD_BYTES) continue

    const cachedUrl = urlByPayload.get(json)
    if (cachedUrl) {
      line.customizerDesign = {
        ...(design as DesignRecord),
        sideLayouts: [],
        sideLayouts_archived_url: cachedUrl,
      }
      continue
    }
    const archived = await archiveSideLayoutsIfLarge(
      scope,
      design as DesignRecord,
      keyHint
    )
    const archivedUrl = archived.sideLayouts_archived_url
    if (typeof archivedUrl === "string") urlByPayload.set(json, archivedUrl)
    line.customizerDesign = archived
  }
}
