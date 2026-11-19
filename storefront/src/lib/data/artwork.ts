"use server"

import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"
import { cache } from "react"

import { getAuthHeaders } from "./cookies"

export type SharedFrom = {
  organisation_id: string
  organisation_name: string
} | null

export type ArtworkItem = {
  id: string
  customer_id: string
  organisation_id: string | null
  name: string
  url: string
  mime_type: string
  thumbnail_url: string | null
  source: "upload" | "order"
  source_order_id: string | null
  hidden_at: string | null
  created_at: string
  updated_at: string
  can_edit: boolean
  shared_from: SharedFrom
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string }

const ARTWORK_TAG = "customer-artwork"
const BASE = "/store/customers/me/artwork"

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback

// Per-customer data, deliberately uncached (same as designs/wishlist).
export const listMyArtwork = cache(async function (): Promise<ArtworkItem[]> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return []
  try {
    const res = (await sdk.client.fetch(BASE, { headers })) as {
      artwork?: ArtworkItem[]
    }
    return res.artwork ?? []
  } catch {
    return []
  }
})

export async function createArtwork(input: {
  url: string
  name: string
  mime_type: string
  thumbnail_url?: string | null
}): Promise<Result<{ artwork: ArtworkItem }>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { ok: false, error: "Sign in to save artwork." }
  }
  try {
    const res = (await sdk.client.fetch(BASE, {
      method: "POST",
      headers,
      body: {
        url: input.url,
        name: input.name,
        mime_type: input.mime_type,
        ...(input.thumbnail_url ? { thumbnail_url: input.thumbnail_url } : {}),
      },
    })) as { artwork: ArtworkItem }
    revalidateTag(ARTWORK_TAG, "max")
    return { ok: true, artwork: res.artwork }
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save that file.") }
  }
}

export async function updateArtwork(
  id: string,
  input: { name?: string; organisation_id?: string | null }
): Promise<Result<{ artwork: ArtworkItem }>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { ok: false, error: "Sign in to update artwork." }
  }
  try {
    const res = (await sdk.client.fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "POST",
      headers,
      body: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.organisation_id !== undefined
          ? { organisation_id: input.organisation_id }
          : {}),
      },
    })) as { artwork: ArtworkItem }
    revalidateTag(ARTWORK_TAG, "max")
    return { ok: true, artwork: res.artwork }
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not update that file.") }
  }
}

export async function deleteArtwork(id: string): Promise<Result<object>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { ok: false, error: "Sign in to delete artwork." }
  }
  try {
    await sdk.client.fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    })
    revalidateTag(ARTWORK_TAG, "max")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not delete that file.") }
  }
}
