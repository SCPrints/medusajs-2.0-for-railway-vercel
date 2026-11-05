import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { ADMIN_PUBLIC_URL, BACKEND_URL } from "../../lib/constants"
import { morningDigestFor, type TodayRow } from "../../lib/job-today"
import { EmailTemplates } from "../../modules/email-notifications/templates"
import type { StaffJobLine } from "../../modules/email-notifications/templates/staff-jobs-today"
import { buildToday } from "./today"

const WAIT = { us: "Waiting on you", customer: "Customer", supplier: "Supplier" } as const
const shortDate = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })

function line(r: TodayRow, root: string): StaffJobLine {
  const parts: string[] = []
  if (r.risk === "late" && r.needed_by) parts.push(`Late · needed ${shortDate(r.needed_by)}`)
  else if (r.risk === "at_risk" && r.needed_by) parts.push(`At risk · needed ${shortDate(r.needed_by)}`)
  if (r.waiting_on) parts.push(`${WAIT[r.waiting_on]}${r.days ? ` · ${r.days} day${r.days === 1 ? "" : "s"}` : ""}`)
  return {
    label: r.label,
    customer: r.customer,
    subject: r.subject,
    next: r.next_action.label,
    note: parts.join(" · ") || null,
    url: `${root}/app/jobs?folder=mine&job=${encodeURIComponent(r.id)}`,
  }
}

/** Sends each admin who owns open jobs their list. Admins with none get nothing. */
export async function sendStaffJobsToday(container: MedusaContainer): Promise<{ sent: number; failed: number }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const root = (ADMIN_PUBLIC_URL ?? BACKEND_URL ?? "").replace(/\/$/, "")
  const view = await buildToday(container, { fresh: true })
  const users: any[] = await (container.resolve(Modules.USER) as any).listUsers({}, { take: 100 })
  const notifications = container.resolve(Modules.NOTIFICATION) as any

  let sent = 0
  let failed = 0
  for (const u of users) {
    if (!u.email) continue
    const { rows, unowned } = morningDigestFor(view, u.id)
    if (!rows.length) continue
    const ours = rows.filter((r) => r.needs_us).map((r) => line(r, root))
    const theirs = rows.filter((r) => !r.needs_us).map((r) => line(r, root))
    try {
      await notifications.createNotifications({
        to: u.email,
        channel: "email",
        template: EmailTemplates.STAFF_JOBS_TODAY,
        data: {
          emailOptions: { subject: ours.length ? `Your jobs today: ${ours.length} waiting on you` : "Your jobs today" },
          name: u.first_name ?? null,
          ours,
          theirs,
          unowned,
          listUrl: `${root}/app/jobs?folder=mine`,
        },
      })
      sent += 1
    } catch (err: any) {
      failed += 1
      logger.warn(`staff-jobs-today: ${u.email} failed: ${err?.message ?? err}`)
    }
  }
  return { sent, failed }
}
