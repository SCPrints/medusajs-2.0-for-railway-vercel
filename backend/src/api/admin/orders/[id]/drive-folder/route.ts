import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../lib/audit-log"
import { getPostHog } from "../../../../../lib/posthog"
import {
  createJobFolder,
  isDriveConfigured,
  type JobFolder,
} from "../../../../../services/google-drive/create-job-folder"

/**
 * Google Drive job folder per order. Replaces the manual workflow of
 * creating "<Company> | <Customer> | <Order #>" in Drive with a "Files"
 * subfolder for artwork. Stamped on `order.metadata.drive_folder` so the
 * widget shows a link instead of the button once created (idempotent —
 * double-clicks can't produce a second folder).
 */

const DRIVE_FOLDER_KEY = "drive_folder"

const postSchema = z.object({
  // Optional override — the widget prefills the suggested name and staff
  // can tidy it (e.g. fix company-name casing) before creating.
  name: z.string().trim().min(1).max(200).optional(),
})

type StoredFolder = JobFolder & { name: string; created_at: string }

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

async function loadOrder(req: MedusaRequest): Promise<any | null> {
  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)
  try {
    return await orderModuleService.retrieveOrder(req.params.id, {
      relations: ["billing_address", "shipping_address"],
    })
  } catch {
    return null
  }
}

/** GET → { configured, folder, suggested_name } */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const order = await loadOrder(req)
  if (!order) return res.status(404).json({ error: "Order not found" })

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  return res.json({
    configured: isDriveConfigured(),
    folder: readStoredFolder(meta),
    suggested_name: buildSuggestedName(order),
  })
}

/** POST { name? } → { folder, idempotent? } — creates the Drive folder + "Files" subfolder. */
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
  if (existing) {
    return res.json({ folder: existing, idempotent: true })
  }

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

  const stored: StoredFolder = {
    ...created,
    name,
    created_at: new Date().toISOString(),
  }

  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)
  try {
    // Read-modify-write: Medusa replaces the whole metadata jsonb on update.
    await orderModuleService.updateOrders(order.id, {
      metadata: { ...meta, [DRIVE_FOLDER_KEY]: stored },
    })
  } catch (err: any) {
    // Folder exists in Drive but the stamp failed — surface both facts so
    // staff don't create a duplicate by retrying blindly.
    return res.status(500).json({
      error: "Folder created in Drive but saving the link to the order failed",
      detail: String(err?.message ?? err),
      folder: stored,
    })
  }

  const actorId = (req as any).auth_context?.actor_id ?? null
  await writeAudit({
    container: req.scope,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: order.id,
    action: AUDIT_ACTION.DRIVE_FOLDER_CREATED,
    actor_id: actorId,
    details: { name, folder_id: stored.id, url: stored.url },
  })

  try {
    getPostHog()?.capture({
      distinctId: actorId ?? "admin",
      event: "drive_job_folder_created",
      properties: { order_id: order.id, display_id: order.display_id, name },
    })
  } catch {
    // best-effort
  }

  return res.json({ folder: stored })
}
