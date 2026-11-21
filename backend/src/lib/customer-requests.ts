/**
 * Customer requests on an order (portal #21 problems, #36 size swaps), kept
 * as a capped list on `order.metadata.customer_requests`. Pure helpers.
 */

export const PROBLEM_KINDS = ["wrong_item", "wrong_size", "print_fault", "damaged", "missing", "other"] as const
export type ProblemKind = (typeof PROBLEM_KINDS)[number]
export const REQUEST_STATUSES = ["open", "approved", "declined", "resolved"] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]
export const MAX_REQUESTS = 50

export type CustomerRequest = {
  id: string
  kind: "problem" | "size_swap"
  status: RequestStatus
  staff_note: string | null
  created_at: string
  decided_at: string | null
  /** problem */
  problem?: ProblemKind
  details?: string | null
  line_item_ids?: string[]
  photo_urls?: string[]
  /** size_swap */
  line_item_id?: string
  from_size?: string
  to_size?: string
  quantity?: number
  note?: string | null
}

/** Newest-last list with the new request appended; oldest dropped past the cap. */
export const appendRequest = (list: CustomerRequest[], req: CustomerRequest): CustomerRequest[] =>
  [...list, req].slice(-MAX_REQUESTS)

export const readRequests = (metadata: unknown): CustomerRequest[] => {
  const v = (metadata as any)?.customer_requests
  return Array.isArray(v) ? (v as CustomerRequest[]) : []
}

/** null when the id isn't in the list. */
export function decideRequest(
  list: CustomerRequest[],
  id: string,
  status: RequestStatus,
  staffNote: string | null,
  now: Date
): CustomerRequest[] | null {
  if (!list.some((r) => r.id === id)) return null
  return list.map((r) =>
    r.id === id
      ? { ...r, status, staff_note: staffNote?.trim() || r.staff_note || null, decided_at: status === "open" ? null : now.toISOString() }
      : r
  )
}
