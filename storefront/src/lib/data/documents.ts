"use server"

import { sdk } from "@lib/config"

import { getAuthHeaders } from "./cookies"

export type SupplierDocument = { id: string; title: string; url: string; updated_at: string }

/** SC Prints' own documents (ABN certificate, insurance…) for signed-in customers. */
export async function listSupplierDocuments(): Promise<SupplierDocument[]> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return []
  try {
    const res = (await sdk.client.fetch("/store/customers/me/documents", { headers })) as {
      documents?: SupplierDocument[]
    }
    return res.documents ?? []
  } catch {
    return []
  }
}
