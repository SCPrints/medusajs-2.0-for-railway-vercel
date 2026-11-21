"use client"

import { useState } from "react"

import { setCartPoNumber } from "@lib/data/cart"

/**
 * Optional PO number / order reference, saved to `cart.metadata.po_number`
 * on blur. Next.js runs server actions one at a time per client, so a save
 * that starts on blur finishes before "Place order" runs.
 */
const PoNumber = ({ initial }: { initial: string }) => {
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const next = value.trim()
    if (next === saved) return
    setState("saving")
    const res = await setCartPoNumber(next)
    if (!res.ok) {
      setState("error")
      setError(res.error)
      return
    }
    setSaved(next)
    setState("saved")
  }

  return (
    <div className="mb-6">
      <label htmlFor="po-number" className="block text-sm font-medium text-ui-fg-base">
        PO number / order reference <span className="font-normal text-ui-fg-subtle">(optional)</span>
      </label>
      <div className="mt-1 flex items-center gap-3">
        <input
          id="po-number"
          name="po_number"
          value={value}
          maxLength={60}
          onChange={(e) => {
            setValue(e.target.value)
            setState("idle")
          }}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void save()
            }
          }}
          placeholder="e.g. PO-12345"
          autoComplete="off"
          className="min-h-11 w-full max-w-sm rounded-md border border-ui-border-base bg-white px-3 text-base focus:outline-hidden focus:ring-2 focus:ring-ink"
          data-testid="po-number-input"
        />
        <span className="text-xs text-ui-fg-subtle" aria-live="polite">
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
        </span>
      </div>
      {state === "error" && error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : (
        <p className="mt-1 text-xs text-ui-fg-subtle">Shows on your invoice and receipt.</p>
      )}
    </div>
  )
}

export default PoNumber
