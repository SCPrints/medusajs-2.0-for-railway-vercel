/**
 * The job read model as served by GET /admin/jobs/:id and rendered by the
 * admin Job panel. Types only — imported by the admin bundle, so nothing
 * from @medusajs/framework here.
 */
import type { JobState } from "./job-state"
import type { ArtworkStage, BlanksStage, DownstreamStage } from "./production-stage"

export type JobActivityKind =
  | "enquiry"
  | "email_in"
  | "email_out"
  | "note"
  | "stage"
  | "status"
  | "comment"
  | "photo"
  | "reject"
  | "nps"
  | "system"
  | "task"

export type JobActivity = {
  at: string
  kind: JobActivityKind
  title: string
  detail: string | null
  actor: string | null
  thumbnail_url?: string | null
}

export type JobLine = {
  id: string
  title: string
  subtitle: string | null
  quantity: number
  unit_price: number | null
  total: number | null
  thumbnail: string | null
  decorated: boolean
}

export type JobView = {
  id: string
  kind: "quote" | "order"
  title: string
  quote: {
    id: string
    public_id: string
    status: string
    subject: string | null
    assigned_to: string | null
    total_estimate: number | null
    expires_at: string | null
    quoted_at: string | null
    accepted_at: string | null
    has_job_pricer: boolean
    design_approval_status: string | null
  } | null
  order: {
    id: string
    display_id: number | null
    status: string
    payment_status: string
    tracks: { artwork: ArtworkStage; blanks: BlanksStage; downstream: DownstreamStage }
    production_due_date: string | null
    delivery_method: string | null
    is_stale: boolean
    /** Rush sold in the Job pricer (metadata.rush_tier). */
    rush_tier: "priority" | "express" | null
  } | null
  customer: {
    id: string | null
    name: string | null
    email: string | null
    phone: string | null
    company: string | null
    has_account: boolean
  }
  owner: { user_id: string; label: string } | null
  address: {
    shipping: Record<string, string | null> | null
    placeholder: boolean
    found_in_thread: string | null
  }
  money: {
    currency_code: string
    quoted: number | null
    order_total: number | null
    paid: number
    outstanding: number | null
    deposit_required_cents: number
    deposit_paid: boolean
    open_payment_link: { url: string; scenario: string | null; created_at: string } | null
  }
  lines: JobLine[]
  flags: { kind: string; label: string }[]
  tasks: { id: string; title: string; status: string; priority: string; due_at: string | null; assignee_user_id: string; follow_up: boolean }[]
  activity: JobActivity[]
  unread_inbound: number
  state: JobState
}
