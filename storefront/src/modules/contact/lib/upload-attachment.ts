/**
 * Uploads a single contact-form attachment via Medusa `/store/contact/attachments`.
 *
 * 1) **Direct** POST to the backend (avoids Vercel's ~4.5MB proxy body cap so
 *    real print-ready artwork uploads; needs STORE_CORS + publishable key).
 * 2) **Fallback:** same-origin `/api/contact/attachments` (server → Medusa; no
 *    browser CORS issue). Small files always work; very large files may hit the
 *    platform body limit on this proxy hop.
 *
 * Mirrors `uploadCustomerOriginalUnchanged` in the customizer module.
 */

export type ContactAttachment = {
  url: string
  fileName: string
  mimeType: string
  bytes: number
}

function medusaBackendBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/+$/, "").replace(/\/store$/i, "")
}

async function fileToBase64Payload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result ?? "")
      const comma = s.indexOf(",")
      resolve(comma >= 0 ? s.slice(comma + 1) : s)
    }
    reader.onerror = () => reject(new Error("Unable to read file"))
    reader.readAsDataURL(file)
  })
}

function parseUploadResponse(res: Response, raw: unknown): ContactAttachment | null {
  const j = raw as { url?: string; fileName?: string; mimeType?: string; bytes?: number }
  if (!res.ok) return null
  if (typeof j.url !== "string" || !j.url.trim()) return null
  return {
    url: j.url.trim(),
    fileName: typeof j.fileName === "string" ? j.fileName : "attachment",
    mimeType: typeof j.mimeType === "string" ? j.mimeType : "application/octet-stream",
    bytes: typeof j.bytes === "number" ? j.bytes : 0,
  }
}

/**
 * @returns The stored attachment (public URL + metadata) when storage succeeds,
 *          or `null` when both the direct and proxy paths fail.
 */
export async function uploadContactAttachment(file: File): Promise<ContactAttachment | null> {
  const dataBase64 = await fileToBase64Payload(file)
  const payload = {
    fileName: file.name || "upload",
    mimeType: file.type || "application/octet-stream",
    dataBase64,
  }

  const base = medusaBackendBase()
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim()

  /** (1) Browser → Medusa — fast, no Vercel hop; requires CORS allowlist for this origin. */
  if (base && publishableKey) {
    try {
      const res = await fetch(`${base}/store/contact/attachments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": publishableKey,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        mode: "cors",
      })
      const raw = await res.json().catch(() => ({}))
      const attachment = parseUploadResponse(res, raw)
      if (attachment) return attachment
    } catch (e) {
      console.warn("[contact] Direct attachment upload failed (often CORS); trying same-origin proxy:", e)
    }
  }

  /** (2) Browser → Vercel API → Medusa — same origin, no CORS; server adds publishable key. */
  try {
    const res = await fetch("/api/contact/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    })
    const raw = await res.json().catch(() => ({}))
    return parseUploadResponse(res, raw)
  } catch (e) {
    console.warn("[contact] Proxied attachment upload error:", e)
    return null
  }
}
