import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../lib/audit-log"
import {
  buildLineCustomizerExport,
  lineMockupGroupKey,
} from "../../../../../lib/customizer-order-artifacts"
import { getPostHog } from "../../../../../lib/posthog"
import {
  createJobFolder,
  isDriveConfigured,
  uploadUrlToFolder,
  type JobFolder,
} from "../../../../../services/google-drive/create-job-folder"

/**
 * Google Drive job folder per order. Replaces the manual workflow of
 * creating "<Company> | <Customer> | <Order #>" in Drive with a "Files"
 * subfolder for artwork. POST creates the folder AND uploads the order's
 * customizer files (customer original uploads + per-side mockups) into
 * "Files"; re-POSTing on an existing folder syncs any files not yet
 * uploaded (tracked by URL on the metadata stamp), so late-arriving
 * artwork can be pushed with the same button.
 */

const DRIVE_FOLDER_KEY = "drive_folder"

const postSchema = z.object({
  // Optional override — the widget prefills the suggested name and staff
  // can tidy it (e.g. fix company-name casing) before creating.
  name: z.string().trim().min(1).max(200).optional(),
})

type StoredFolder = JobFolder & {
  name: string
  created_at: string
  uploaded_urls?: string[]
}

export type DriveUploadCandidate = {
  url: string
  name: string
  mime?: string
}

function readStoredFolder(meta: Record<string, unknown>): StoredFolder | null {
  const raw = meta[DRIVE_FOLDER_KEY] as StoredFolder | undefined
  return raw && typeof raw === "object" && typeof raw.id === "string" ? raw : null
}

export function buildSuggestedName(order: any): string {
  const addr = order.billing_address ?? order.shipping_address
  const company = typeof addr?.company === "string" ? addr.company.trim() : ""
  const person = [addr?.first_name, addr?.last_name]
    .filter((p: unknown) => typeof p === "string" && (p as string).trim())
    .join(" ")
    .trim()
  const parts = [company, person || order.email, `${order.display_id ?? ""}`]
  return parts.filter(Boolean).join(" | ")
}

function isHttpUrl(u: string): boolean {
  return u.startsWith("http://") || u.startsWith("https://")
}

type RevisedProofLike = {
  side?: string
  url?: string
  filename?: string
  mime_type?: string
}

/**
 * Collects the order's uploadable files: customer original uploads (deduped
 * by URL — one design across N size lines repeats them), per-side mockups
 * (deduped by design-group/colour via lineMockupGroupKey, same convention as
 * the artwork-approval surfaces), and admin-created revised proofs from
 * `order.metadata.revised_proofs`. Inline data: URLs are skipped — only real
 * R2/http URLs upload. Name collisions get a " (n)" suffix.
 */
export function collectOrderDriveFiles(
  items: Array<{
    id: string
    title?: string | null
    product_title?: string | null
    variant_title?: string | null
    product_id?: string | null
    quantity?: unknown
    metadata?: Record<string, unknown> | null
  }>,
  revisedProofs: RevisedProofLike[] = []
): DriveUploadCandidate[] {
  const out: DriveUploadCandidate[] = []
  const seenUrls = new Set<string>()
  const seenMockupKeys = new Set<string>()
  const usedNames = new Map<string, number>()

  const uniqueName = (name: string): string => {
    const n = (usedNames.get(name) ?? 0) + 1
    usedNames.set(name, n)
    if (n === 1) return name
    const dot = name.lastIndexOf(".")
    return dot > 0
      ? `${name.slice(0, dot)} (${n})${name.slice(dot)}`
      : `${name} (${n})`
  }

  for (const item of items) {
    const line = buildLineCustomizerExport(item)
    if (!line.has_customizer) continue

    for (const f of line.customer_original_files) {
      if (!isHttpUrl(f.url) || seenUrls.has(f.url)) continue
      seenUrls.add(f.url)
      out.push({
        url: f.url,
        name: uniqueName(f.file_name),
        mime: f.mime_type,
      })
    }

    const groupKey = lineMockupGroupKey(item)
    const product = line.product_title || line.title || "Design"
    for (const art of line.artifacts) {
      const url = art.mockup_url
      if (!url || !isHttpUrl(url) || seenUrls.has(url)) continue
      const mockupKey = `${groupKey}:${art.side}`
      if (seenMockupKeys.has(mockupKey)) continue
      seenMockupKeys.add(mockupKey)
      seenUrls.add(url)
      out.push({
        url,
        name: uniqueName(`Mockup - ${product} - ${art.side_label}.png`),
        mime: "image/png",
      })
    }
  }

  for (const p of revisedProofs) {
    const url = typeof p?.url === "string" ? p.url : ""
    if (!url || !isHttpUrl(url) || seenUrls.has(url)) continue
    seenUrls.add(url)
    const side = typeof p.side === "string" && p.side ? p.side : "proof"
    const base =
      typeof p.filename === "string" && p.filename.trim()
        ? p.filename.trim()
        : `Revised proof - ${side}.png`
    out.push({
      url,
      name: uniqueName(`Revised proof - ${side} - ${base}`),
      mime: typeof p.mime_type === "string" ? p.mime_type : undefined,
    })
  }

  return out
}

function readRevisedProofs(meta: Record<string, unknown>): RevisedProofLike[] {
  const raw = meta.revised_proofs
  return Array.isArray(raw) ? (raw as RevisedProofLike[]) : []
}

async function loadOrder(req: MedusaRequest): Promise<any | null> {
  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)
  try {
    return await orderModuleService.retrieveOrder(req.params.id, {
      relations: ["billing_address", "shipping_address", "items"],
    })
  } catch {
    return null
  }
}

/** GET → { configured, folder, suggested_name, pending_files } */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const order = await loadOrder(req)
  if (!order) return res.status(404).json({ error: "Order not found" })

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  const folder = readStoredFolder(meta)
  const uploaded = new Set(folder?.uploaded_urls ?? [])
  const candidates = collectOrderDriveFiles(order.items ?? [], readRevisedProofs(meta))

  return res.json({
    configured: isDriveConfigured(),
    folder,
    suggested_name: buildSuggestedName(order),
    pending_files: candidates.filter((c) => !uploaded.has(c.url)).length,
  })
}

/**
 * POST { name? } → { folder, uploaded, failed, idempotent? }
 * Creates the Drive folder + "Files" subfolder and uploads the order's
 * customizer files. On an existing folder, uploads only files not yet synced.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  let parsed: z.infer<typeof postSchema>
  try {
    parsed = postSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "Invalid request" })
  }

  if (!isDriveConfigured()) {
    return res.status(503).json({
      error:
        "Google Drive is not configured (GOOGLE_DRIVE_JOBS_FOLDER_ID unset).",
    })
  }

  const order = await loadOrder(req)
  if (!order) return res.status(404).json({ error: "Order not found" })

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  const existing = readStoredFolder(meta)
  const actorId = (req as any).auth_context?.actor_id ?? null

  let stored: StoredFolder
  let createdNow = false

  if (existing) {
    stored = existing
  } else {
    const name = parsed.name || buildSuggestedName(order)
    let created: JobFolder
    try {
      created = await createJobFolder(name)
    } catch (err: any) {
      return res.status(502).json({
        error: "Drive folder creation failed",
        detail: String(err?.message ?? err),
      })
    }
    stored = {
      ...created,
      name,
      created_at: new Date().toISOString(),
      uploaded_urls: [],
    }
    createdNow = true
  }

  // Upload any files not yet synced into the "Files" subfolder.
  const uploadedUrls = new Set(stored.uploaded_urls ?? [])
  const targetFolderId = stored.files_id || stored.id
  const candidates = collectOrderDriveFiles(
    order.items ?? [],
    readRevisedProofs(meta)
  ).filter((c) => !uploadedUrls.has(c.url))
  const failed: Array<{ name: string; error: string }> = []
  for (const c of candidates) {
    try {
      await uploadUrlToFolder(targetFolderId, c.name, c.url, c.mime)
      uploadedUrls.add(c.url)
    } catch (err: any) {
      failed.push({ name: c.name, error: String(err?.message ?? err) })
    }
  }

  stored = { ...stored, uploaded_urls: [...uploadedUrls] }

  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)
  try {
    // Read-modify-write: Medusa replaces the whole metadata jsonb on update.
    await orderModuleService.updateOrders(order.id, {
      metadata: { ...meta, [DRIVE_FOLDER_KEY]: stored },
    })
  } catch (err: any) {
    return res.status(500).json({
      error: createdNow
        ? "Folder created in Drive but saving the link to the order failed"
        : "Files uploaded but saving sync state to the order failed",
      detail: String(err?.message ?? err),
      folder: stored,
    })
  }

  if (createdNow) {
    await writeAudit({
      container: req.scope,
      entity: AUDIT_ENTITY.ORDER,
      entity_id: order.id,
      action: AUDIT_ACTION.DRIVE_FOLDER_CREATED,
      actor_id: actorId,
      details: {
        name: stored.name,
        folder_id: stored.id,
        url: stored.url,
        files_uploaded: candidates.length - failed.length,
      },
    })
  }

  try {
    getPostHog()?.capture({
      distinctId: actorId ?? "admin",
      event: createdNow ? "drive_job_folder_created" : "drive_job_folder_synced",
      properties: {
        order_id: order.id,
        display_id: order.display_id,
        uploaded: candidates.length - failed.length,
        failed: failed.length,
      },
    })
  } catch {
    // best-effort
  }

  return res.json({
    folder: stored,
    uploaded: candidates.length - failed.length,
    failed,
    ...(existing && !candidates.length ? { idempotent: true } : {}),
  })
}
