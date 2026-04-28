/**
 * Sends the customer's file byte-for-byte to Medusa `/store/customizer/upload-original`
 * **directly** (not via `/api/` on Vercel), so large PNGs aren't blocked by the ~4.5MB
 * Next.js/App Router body limit.
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

/**
 * @returns Public MinIO/object URL when storage succeeds; `null` on failure or misconfiguration.
 */
export async function uploadCustomerOriginalUnchanged(file: File): Promise<string | null> {
  const mimeType: "image/png" | "image/jpeg" | "image/svg+xml" =
    file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/svg+xml"
      ? file.type
      : "image/png"

  const base = medusaBackendBase()
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim()

  if (!base || !publishableKey) {
    console.warn("[customizer] Missing NEXT_PUBLIC_MEDUSA_BACKEND_URL or NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY; cannot archive originals.")
    return null
  }

  const url = `${base}/store/customizer/upload-original`

  try {
    const dataBase64 = await fileToBase64Payload(file)
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": publishableKey,
      },
      body: JSON.stringify({
        fileName: file.name || "upload",
        mimeType,
        dataBase64,
      }),
      cache: "no-store",
      mode: "cors",
    })
    const j = (await res.json().catch(() => ({}))) as { url?: string; message?: string }
    if (!res.ok) {
      console.warn("[customizer] Original file upload failed:", j.message ?? res.status, url)
      return null
    }
    return typeof j.url === "string" && j.url.trim() ? j.url.trim() : null
  } catch (e) {
    console.warn("[customizer] Original file upload error:", e)
    return null
  }
}
