import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { INotificationModuleService, MedusaContainer } from "@medusajs/framework/types"

import { writeAudit } from "../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../lib/audit-entities"
import {
  ADMIN_PUBLIC_URL,
  CONTACT_NOTIFICATION_EMAIL,
  ORDER_NOTIFICATION_EMAIL,
  SUPPORT_REPLY_TO_EMAIL,
} from "../lib/constants"
import { EmailTemplates } from "../modules/email-notifications/templates"
import { ADMIN_WORKSPACE_MODULE } from "../modules/admin-workspace"
import { captureEvent } from "../lib/posthog"

/**
 * Backend health alarms (2026-10-28: four out-of-memory kills in 25 minutes and
 * nobody knew until a customer-facing render failed).
 *
 * 1. Restart without a deploy: every boot writes a `system/backend/booted`
 *    audit row with the image ref. A boot on the SAME image as the previous
 *    boot means the process died and Fly restarted it — usually OOM.
 *    (A manual `fly machine restart` also trips it; that's fine.)
 * 2. Memory high-water: RSS is sampled every 2 s (a spike kills the VM in
 *    seconds, so a per-minute read would miss it); above 80 % of the VM's
 *    memory, alert. 30-minute cooldown.
 *
 * Email goes to OPS_ALERT_EMAIL (falls back to ORDER_ / CONTACT_NOTIFICATION_EMAIL).
 */
const RSS_ALERT_RATIO = 0.8
const MEMORY_ALERT_COOLDOWN_MS = 30 * 60_000

let bootChecked = false
let peakRss = 0
let lastMemoryAlertAt = 0
let sampler: NodeJS.Timeout | null = null

const vmMemoryBytes = () => (Number(process.env.FLY_VM_MEMORY_MB) || 4096) * 1024 * 1024
const recipient = () =>
  process.env.OPS_ALERT_EMAIL?.trim() || ORDER_NOTIFICATION_EMAIL || CONTACT_NOTIFICATION_EMAIL || null

async function sendAlert(
  container: MedusaContainer,
  alert: { name: string; metricLabel: string; threshold: number; value: number }
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.warn(`backend-health: ${alert.name} (${alert.metricLabel} ${alert.value})`)
  captureEvent("system", "backend_health_alert", alert)
  const to = recipient()
  if (!to) return
  try {
    const notifications: INotificationModuleService = container.resolve(Modules.NOTIFICATION)
    await notifications.createNotifications({
      to,
      channel: "email",
      template: EmailTemplates.THRESHOLD_ALERT,
      data: {
        emailOptions: { replyTo: SUPPORT_REPLY_TO_EMAIL, subject: `⚠ ${alert.name}` },
        alert: { ...alert, comparator: "gte", cooldownDays: 0, adminUrl: ADMIN_PUBLIC_URL ?? null },
      },
    })
  } catch (err: any) {
    logger.error(`backend-health: alert email failed: ${err?.message ?? err}`)
  }
}

async function checkBoot(container: MedusaContainer) {
  const image = process.env.FLY_IMAGE_REF ?? "local"
  const machine = process.env.FLY_MACHINE_ID ?? "local"
  const service = container.resolve(ADMIN_WORKSPACE_MODULE) as any
  const [previous] = await service.listAuditLogs(
    { entity: AUDIT_ENTITY.SYSTEM, entity_id: "backend", action: AUDIT_ACTION.BOOTED },
    { order: { created_at: "DESC" }, take: 1 }
  )
  await writeAudit({
    container,
    entity: AUDIT_ENTITY.SYSTEM,
    entity_id: "backend",
    action: AUDIT_ACTION.BOOTED,
    details: { image, machine, uptime_s: Math.round(process.uptime()) },
  })
  const prev = previous?.details ?? {}
  if (image !== "local" && prev.image === image && prev.machine === machine) {
    await sendAlert(container, {
      name: "Backend restarted without a deploy (likely out of memory)",
      metricLabel: "Restarts since the last boot on this build",
      threshold: 1,
      value: 1,
    })
  }
}

export default async function watchBackendHealthJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  if (!sampler) {
    sampler = setInterval(() => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss)
    }, 2_000)
    sampler.unref()
  }
  try {
    if (!bootChecked) {
      bootChecked = true
      await checkBoot(container)
    }
    const limit = vmMemoryBytes()
    const peak = Math.max(peakRss, process.memoryUsage().rss)
    peakRss = 0
    if (peak > limit * RSS_ALERT_RATIO && Date.now() - lastMemoryAlertAt > MEMORY_ALERT_COOLDOWN_MS) {
      lastMemoryAlertAt = Date.now()
      await sendAlert(container, {
        name: "Backend memory above 80%",
        metricLabel: "Peak memory in the last minute (MB)",
        threshold: Math.round((limit * RSS_ALERT_RATIO) / 1048576),
        value: Math.round(peak / 1048576),
      })
    }
  } catch (err: any) {
    logger.error(`backend-health: ${err?.message ?? err}`)
  }
}

export const config = {
  name: "watch-backend-health",
  schedule: "* * * * *",
}
