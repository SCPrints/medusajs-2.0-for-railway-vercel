"use client"

import { useParams, useRouter } from "next/navigation"
import { useCallback } from "react"

import SearchOverlay from "../../components/search-overlay"

/**
 * Deep-link backstop for the `/<cc>/search` route. The primary search
 * trigger lives in the nav (see `NavSearchTrigger`) as a client-state
 * toggle — that's the path most users hit. This file exists only to keep
 * `/<cc>/search` as a working URL for bookmarks, direct visits, or any
 * link that historically pointed here.
 *
 * Closing routes home rather than calling `router.back()`. Direct visitors
 * have no in-app history to go back to, and calling `router.back()` would
 * either no-op or send them outside the site.
 */
export default function SearchModal() {
  const router = useRouter()
  const params = useParams()
  const rawCountry = params?.countryCode
  const countryCode = Array.isArray(rawCountry) ? rawCountry[0] : rawCountry ?? ""

  const close = useCallback(() => {
    router.push(countryCode ? `/${countryCode}` : "/")
  }, [router, countryCode])

  return <SearchOverlay open onClose={close} />
}
