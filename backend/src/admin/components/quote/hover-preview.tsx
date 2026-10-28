import { Tooltip } from "@medusajs/ui"
import { useEffect, useState, type ReactNode } from "react"

// Formats sharp can't read; don't ask the server, just say so.
const NO_PREVIEW_EXT = /\.(pdf|ai|eps|psd|cdr|dst|emb|pes|zip|docx?|xlsx?)(\?|$)/i

/**
 * Where the hover box loads its picture from. Our R2 files go through the
 * thumbnail route (~480 px webp, kept on R2); supplier product photos and
 * inline data URLs are already small, so they load as they are.
 */
export const previewSrc = (url?: string | null): string | null => {
  if (!url || NO_PREVIEW_EXT.test(url)) return null
  if (url.startsWith("data:image/")) return url
  try {
    const host = new URL(url).hostname
    if (/\.r2\.(dev|cloudflarestorage\.com)$/i.test(host)) {
      return `/admin/thumbnail?url=${encodeURIComponent(url)}`
    }
    return url
  } catch {
    return null
  }
}

// ponytail: browser HTTP cache does the real work; this Set only stops repeat requests per page life.
const preloaded = new Set<string>()

/** Fetch every preview in the background so hovering never waits. */
export const usePreloadPreviews = (urls: Array<string | null | undefined>) => {
  const key = urls.filter(Boolean).join("\n")
  useEffect(() => {
    for (const url of key.split("\n")) {
      const src = previewSrc(url)
      if (!src || preloaded.has(src)) continue
      preloaded.add(src)
      const img = new Image()
      img.decoding = "async"
      img.src = src
    }
  }, [key])
}

// Transparent artwork (often white ink) shows on a grey checkerboard.
const CHECKERBOARD = {
  background: "repeating-conic-gradient(#e4e4e7 0% 25%, #ffffff 0% 50%) 50% / 16px 16px",
}

export function HoverPreview({
  url,
  label,
  checker = false,
  children,
}: {
  url?: string | null
  label: string
  /** Checkerboard behind the image (artwork / print files). */
  checker?: boolean
  children: ReactNode
}) {
  const src = previewSrc(url)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])

  return (
    <Tooltip
      delayDuration={80}
      maxWidth={300}
      side="top"
      className="p-2"
      content={
        <div className="flex w-[264px] flex-col gap-y-1.5">
          {src && !broken ? (
            <img
              src={src}
              alt={label}
              onError={() => setBroken(true)}
              className="block h-[248px] w-[264px] rounded-md bg-white object-contain"
              style={checker ? CHECKERBOARD : undefined}
            />
          ) : (
            <div className="flex h-[72px] w-[264px] items-center justify-center rounded-md bg-ui-bg-subtle text-ui-fg-muted">
              No preview. Click to open.
            </div>
          )}
          <span className="truncate text-ui-fg-base">{label}</span>
        </div>
      }
    >
      {children}
    </Tooltip>
  )
}
