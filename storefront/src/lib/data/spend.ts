"use server"

import { sdk } from "@lib/config"

import { getAuthHeaders } from "./cookies"

export type SpendMonth = { month: string; label: string; total: number; orders: number }

export type StatementRow = {
  order_id: string
  display_id: string | null
  date: string
  po_number: string | null
  cost_centre: string | null
  total: number
  paid: number
  outstanding: number
  status: "paid" | "part_paid" | "outstanding" | "refunded"
  status_label: string
}

export type SpendResponse = {
  scope: { type: "customer" } | { type: "organisation"; id: string; name: string | null }
  /** Organisations this customer can run the report for (owner / purchaser). */
  organisations: Array<{ id: string; name: string }>
  report: {
    generated_at: string
    months: SpendMonth[]
    cost_centres: Array<{ cost_centre: string; total: number; orders: number }>
    statement: StatementRow[]
    totals: { spend: number; paid: number; outstanding: number; orders: number }
  }
}

export async function getMySpend(organisationId?: string): Promise<SpendResponse | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    return (await sdk.client.fetch("/store/customers/me/spend", {
      headers,
      query: organisationId ? { organisation_id: organisationId } : {},
    })) as SpendResponse
  } catch {
    return null
  }
}
