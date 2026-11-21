"use client"

import { useState } from "react"

import { makeSampleLine } from "@lib/data/sample-line"
import { isSampleLine, sampleBlockReason } from "@modules/cart/lib/sample"

type Props = {
  item: { id: string; quantity: number; title?: string | null; product_title?: string | null; metadata?: any }
}

/** "Order one sample first" on a cart line. Renders nothing when a sample isn't possible. */
const SampleFirst = ({ item }: Props) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isSampleLine(item)) {
    return <p className="txt-small mt-1 font-medium text-emerald-700">Sample: one garment</p>
  }
  if (sampleBlockReason(item.metadata, item.product_title || item.title)) return null

  const go = async () => {
    if (item.quantity > 1 && !window.confirm("This changes the line to one garment. Continue?")) return
    setBusy(true)
    setError(null)
    setError(await makeSampleLine(item.id))
    setBusy(false)
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="min-h-11 text-left text-sm font-medium text-ui-fg-interactive underline disabled:opacity-60"
        data-testid="sample-first-button"
      >
        {busy ? "One moment…" : "Order one sample first"}
      </button>
      <p className="txt-small text-ui-fg-subtle">
        One garment at the normal one-off price, so you can check the print before the full run.
      </p>
      {error ? <p role="alert" className="txt-small text-red-600">{error}</p> : null}
    </div>
  )
}

export default SampleFirst
