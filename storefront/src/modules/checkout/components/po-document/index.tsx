"use client"

import { useRef, useState } from "react"

type Doc = { url: string; name: string }

const MAX_MB = 10

function backendBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.trim()
  return raw ? raw.replace(/\/+$/, "").replace(/\/store$/i, "") : null
}

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result ?? "")
      resolve(s.slice(s.indexOf(",") + 1))
    }
    reader.onerror = () => reject(new Error("We couldn't read that file."))
    reader.readAsDataURL(file)
  })

/**
 * Optional purchase-order document (PDF / photo). The browser posts straight
 * to the backend (Vercel caps proxied bodies at ~4.5MB), which stores it and
 * stamps `cart.metadata.po_document`; it rides onto the order for staff.
 */
const PoDocument = ({ cartId, initial }: { cartId: string; initial: Doc | null }) => {
  const input = useRef<HTMLInputElement>(null)
  const [doc, setDoc] = useState<Doc | null>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const call = async (method: "POST" | "DELETE", body?: unknown) => {
    const base = backendBase()
    const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim()
    if (!base || !key) throw new Error("Upload isn't available right now.")
    const res = await fetch(`${base}/store/carts/${encodeURIComponent(cartId)}/po-document`, {
      method,
      headers: { "Content-Type": "application/json", "x-publishable-api-key": key },
      body: body ? JSON.stringify(body) : undefined,
      mode: "cors",
      cache: "no-store",
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.message || "That didn't work. Try again.")
    return json as { po_document: Doc | null }
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.size > MAX_MB * 1024 * 1024) return setError(`The file must be under ${MAX_MB} MB.`)
    setBusy(true)
    try {
      const out = await call("POST", { fileName: file.name, mimeType: file.type, dataBase64: await toBase64(file) })
      setDoc(out.po_document)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await call("DELETE")
      setDoc(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6" data-testid="po-document">
      <p className="text-sm font-medium text-ui-fg-base">
        Purchase order document <span className="font-normal text-ui-fg-subtle">(optional)</span>
      </p>
      {doc ? (
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
          <a href={doc.url} target="_blank" rel="noreferrer" className="text-ui-fg-base underline">
            {doc.name}
          </a>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="min-h-11 text-sm text-ui-fg-subtle underline disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : (
        <label className="mt-1 inline-flex min-h-11 cursor-pointer items-center rounded-md border border-ui-border-base bg-white px-4 text-sm font-medium text-ui-fg-base">
          {busy ? "Uploading…" : "Attach your PO (PDF or photo)"}
          <input
            ref={input}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="sr-only"
            disabled={busy}
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      )}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : (
        <p className="mt-1 text-xs text-ui-fg-subtle">We keep it with your order for your invoice.</p>
      )}
    </div>
  )
}

export default PoDocument
