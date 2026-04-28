/**
 * Stores the customer's file byte-for-byte via Medusa `/store/customizer/upload-original`.
 *
 * 1) **Direct** POST to Railway (avoids Vercel payload limits; needs STORE_CORS + publishable key).
 * 2) **Fallback:** same-origin `/api/customizer/upload-original` (Server → Medusa; no browser CORS issue).
 *    Smaller files always work; very large files may hit platform limits on the proxy route.
 */

function medusaBackendBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.trim()
  if (!raw) {
    return null
  }
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

type UploadBody = {
  fileName: string
  mimeType: "image/png" | "image/jpeg" | "image/svg+xml"
  dataBase64: string
}

function parseUploadResponse(
  res: Response,
  raw: unknown,
  source: string
): string | null {
  const j = raw as { url?: string; message?: string }
  if (!res.ok) {
    console.warn("[customizer] Original upload failed:", source, j.message ?? res.status)
    return null
  }
  return typeof j.url === "string" && j.url.trim() ? j.url.trim() : null
}

/**
 * @returns Public MinIO/object URL when storage succeeds; `null` when both paths fail.
 */
export async function uploadCustomerOriginalUnchanged(file: File): Promise<string | null> {
  const mimeType: UploadBody["mimeType"] =
    file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/svg+xml"
      ? file.type
      : "image/png"

  const dataBase64 = await fileToBase64Payload(file)
  const payload: UploadBody = {
    fileName: file.name || "upload",
    mimeType,
    dataBase64,
  }

  const base = medusaBackendBase()
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim()

  /** (1) Browser → Medusa — fast, no Vercel hop; requires CORS allowlist for this origin. */
  if (base && publishableKey) {
    try {
      const res = await fetch(`${base}/store/customizer/upload-original`, {
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
      const url = parseUploadResponse(res, raw, "direct")
      if (url) {
        return url
      }
    } catch (e) {
      console.warn("[customizer] Direct original upload failed (often CORS); trying same-origin proxy:", e)
    }
  } else {
    console.warn(
      "[customizer] Skipping direct upload (missing NEXT_PUBLIC_MEDUSA_BACKEND_URL or publishable key); using proxy only."
    )
  }

  /** (2) Browser → Vercel API → Medusa — same origin, no CORS; server adds publishable key from env. */
  try {
    const res = await fetch("/api/customizer/upload-original", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    })
    const raw = await res.json().catch(() => ({}))
    return parseUploadResponse(res, raw, "proxy")
  } catch (e) {
    console.warn("[customizer] Proxied original upload error:", e)
    return null
  }
}
