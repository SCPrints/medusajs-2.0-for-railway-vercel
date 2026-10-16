import { addBusinessDays } from "./business-days"

export type DueDateOnApproval =
  | { action: "set"; due_date: string }
  | { action: "keep_manual"; due_date: string; tight: boolean }

/**
 * The production due date counts from proof approval, so a customer who sits
 * on their proof doesn't eat the studio's production time.
 *
 * - No due date yet, or one set automatically by an earlier approval →
 *   approval + `leadDays` business days.
 * - A date staff typed in (`production_due_date_source !== "auto"`, which
 *   includes dates set before this field existed) is never moved. `tight`
 *   says it's earlier than the automatic date, so staff can be warned.
 */
export function planDueDateOnApproval(
  meta: Record<string, unknown>,
  approvedAt: Date,
  leadDays: number
): DueDateOnApproval {
  const auto = addBusinessDays(approvedAt, leadDays)
  const current =
    typeof meta.production_due_date === "string" && meta.production_due_date
      ? meta.production_due_date.slice(0, 10)
      : null
  if (!current || meta.production_due_date_source === "auto") {
    return { action: "set", due_date: auto }
  }
  return { action: "keep_manual", due_date: current, tight: current < auto }
}
