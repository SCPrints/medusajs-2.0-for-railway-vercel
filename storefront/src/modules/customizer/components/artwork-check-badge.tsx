"use client"

import { useEffect, useRef, useState } from "react"

import { checkArtwork, type ArtworkCheck } from "../lib/artwork-check"

/**
 * Green tick or amber note for one picture. Measures the image once, when it
 * scrolls into view (the browser already has it or fetches it for the tile anyway).
 */
const ArtworkCheckBadge = ({ url, mimeType }: { url: string; mimeType: string }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [result, setResult] = useState<ArtworkCheck | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return
    let gone = false
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return
      io.disconnect()
      const img = new Image()
      img.onload = () => {
        if (gone) return
        setResult(
          checkArtwork({
            mimeType,
            widthPx: img.naturalWidth,
            heightPx: img.naturalHeight,
            hasTransparency: mimeType === "image/jpeg" ? false : null,
          })
        )
      }
      img.src = url
    })
    io.observe(el)
    return () => {
      gone = true
      io.disconnect()
    }
  }, [url, mimeType])

  return (
    <div ref={ref} className="px-1.5 pb-1 text-[11px] leading-snug" data-testid="artwork-check">
      {!result ? null : result.ok ? (
        <p className="text-emerald-700">✓ {result.note ?? result.label}</p>
      ) : (
        <p className="text-amber-700">{result.notes[0]}</p>
      )}
    </div>
  )
}

export default ArtworkCheckBadge
