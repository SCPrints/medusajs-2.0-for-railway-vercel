import "server-only"

import type { InstagramMediaItem } from "@lib/types/instagram"

type GraphMediaNode = {
  id: string
  media_type?: string
  media_url?: string
  permalink?: string
  thumbnail_url?: string
  caption?: string
}

/**
 * Fetches recent Instagram media via the Instagram Graph API.
 *
 * Requires a Facebook / Meta app, Instagram Business or Creator account, and:
 * - `INSTAGRAM_ACCESS_TOKEN` — long‑lived user or page access token with `instagram_basic` (and media permissions as needed)
 * - `INSTAGRAM_USER_ID` — Instagram professional account id (numeric), or omit to use `me` with a user token
 *
 * @see https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 */
export async function getInstagramFeedMedia(): Promise<InstagramMediaItem[]> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!token) {
    return []
  }

  const userId = process.env.INSTAGRAM_USER_ID?.trim() || "me"
  const fields =
    "id,media_type,media_url,permalink,thumbnail_url,caption"

  const url = new URL(
    `https://graph.instagram.com/v21.0/${userId}/media`
  )
  url.searchParams.set("fields", fields)
  url.searchParams.set("limit", "12")
  url.searchParams.set("access_token", token)

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return []
    }

    const json = (await res.json()) as {
      data?: GraphMediaNode[]
    }

    const nodes = json.data ?? []
    const out: InstagramMediaItem[] = []

    for (const node of nodes) {
      const type = node.media_type ?? ""
      let imageUrl: string | undefined

      if (type === "IMAGE" && node.media_url) {
        imageUrl = node.media_url
      } else if (type === "VIDEO" && node.thumbnail_url) {
        imageUrl = node.thumbnail_url
      } else if (node.media_url && type !== "CAROUSEL_ALBUM") {
        imageUrl = node.media_url
      } else if (node.thumbnail_url) {
        imageUrl = node.thumbnail_url
      }

      if (!imageUrl || !node.permalink) {
        continue
      }

      const caption =
        typeof node.caption === "string" ? node.caption.trim() : ""
      const alt =
        caption.length > 0
          ? caption.slice(0, 120)
          : "Photo from Instagram"

      out.push({
        id: node.id,
        imageUrl,
        permalink: node.permalink,
        alt,
      })
    }

    return out
  } catch {
    return []
  }
}

export function getInstagramProfileUrl(): string {
  const url = process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim()
  if (url && /^https?:\/\//i.test(url)) {
    return url.replace(/\/$/, "")
  }
  return "https://www.instagram.com"
}

export function getInstagramHandleDisplay(): string | null {
  const explicit = process.env.NEXT_PUBLIC_INSTAGRAM_HANDLE?.trim()
  if (explicit) {
    return explicit.replace(/^@/, "")
  }
  const profile = getInstagramProfileUrl()
  try {
    const u = new URL(profile)
    const seg = u.pathname.split("/").filter(Boolean)[0]
    return seg ?? null
  } catch {
    return null
  }
}
