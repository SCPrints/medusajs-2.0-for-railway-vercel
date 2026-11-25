/** Medusa marks a cancelled order with status "canceled" (US spelling) and stamps canceled_at. */
export const isCancelledOrder = (
  order: { status?: string | null; canceled_at?: unknown } | null | undefined
): boolean => order?.status === "canceled" || !!order?.canceled_at

/** "26 November 2026" in Sydney time, or "" when the order carries no cancel date. */
export const cancelledOnLabel = (canceledAt: unknown): string => {
  if (typeof canceledAt !== "string" && !(canceledAt instanceof Date)) return ""
  const date = new Date(canceledAt)
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-AU", {
        timeZone: "Australia/Sydney",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : ""
}
