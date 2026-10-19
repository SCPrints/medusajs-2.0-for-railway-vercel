"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { joinGroupOrder, type GroupOrderBundleItem } from "@lib/data/group-order"

const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"]

const JoinForm = ({
  token,
  sizeOptions,
  bundleItems,
}: {
  token: string
  sizeOptions?: string[]
  /** Bundle team order: one size pick per sized item instead of one size. */
  bundleItems?: GroupOrderBundleItem[]
}) => {
  const sizedItems = (bundleItems ?? []).filter((i) => i.sizes.length > 0)
  const isBundle = !!bundleItems?.length
  const [bundleSizes, setBundleSizes] = useState<Record<string, string>>({})
  const router = useRouter()
  // When the group order has a real base product, drive the size
  // picker from its actual variants so participants can only pick
  // sizes that exist on the garment.
  const sizes =
    sizeOptions && sizeOptions.length > 0 ? sizeOptions : COMMON_SIZES
  const [name, setName] = useState("")
  const [size, setSize] = useState(() => sizes.includes("M") ? "M" : sizes[0])
  const [quantity, setQuantity] = useState("1")
  const [playerNumber, setPlayerNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [, startTransition] = useTransition()

  const submit = () => {
    if (!name.trim() || (!isBundle && !size.trim())) {
      setError("Name and size are required.")
      return
    }
    const missing = sizedItems.find((i) => !bundleSizes[i.bundle_item_id])
    if (missing) {
      setError(`Pick a size for ${missing.label}.`)
      return
    }
    setError(null)
    startTransition(async () => {
      const qty = Math.max(1, Number.parseInt(quantity, 10) || 1)
      const res = await joinGroupOrder(token, {
        name: name.trim(),
        ...(isBundle ? { bundle_sizes: bundleSizes } : { size_label: size }),
        quantity: qty,
        player_number: playerNumber.trim() || undefined,
        custom_notes: notes.trim() || undefined,
        submitter_email: email.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSuccess(true)
      setName("")
      setPlayerNumber("")
      setNotes("")
      setBundleSizes({})
      router.refresh()
    })
  }

  if (success) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm text-emerald-800">
          You&apos;re in. Add another person if you need to — refresh the page
          to see them in the roster below.
        </p>
        <button
          type="button"
          onClick={() => setSuccess(false)}
          className="mt-3 inline-flex items-center justify-center rounded-md border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
        >
          Add another
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-3">
      <div>
        <label htmlFor="name" className="text-sm font-semibold text-ink">
          Name *
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand tablet:text-sm"
          placeholder="Player or recipient name"
        />
      </div>
      {sizedItems.length ? (
        <div className="grid grid-cols-1 small:grid-cols-2 gap-3">
          {sizedItems.map((item) => (
            <div key={item.bundle_item_id}>
              <label
                htmlFor={`size-${item.bundle_item_id}`}
                className="text-sm font-semibold text-ink"
              >
                {item.label} size *
              </label>
              <select
                id={`size-${item.bundle_item_id}`}
                value={bundleSizes[item.bundle_item_id] ?? ""}
                onChange={(e) =>
                  setBundleSizes((prev) => ({ ...prev, [item.bundle_item_id]: e.target.value }))
                }
                className="mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand tablet:text-sm"
              >
                <option value="" disabled>
                  Choose a size
                </option>
                {item.sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}
      <div className={`grid grid-cols-1 gap-3 ${isBundle ? "small:grid-cols-2" : "small:grid-cols-3"}`}>
        {isBundle ? null : (
        <div>
          <label htmlFor="size" className="text-sm font-semibold text-ink">
            Size *
          </label>
          <select
            id="size"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand tablet:text-sm"
          >
            {sizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        )}
        <div>
          <label htmlFor="quantity" className="text-sm font-semibold text-ink">
            {isBundle ? "Packs" : "Quantity"}
          </label>
          <input
            id="quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand tablet:text-sm"
          />
        </div>
        <div>
          <label htmlFor="player_number" className="text-sm font-semibold text-ink">
            Number (optional)
          </label>
          <input
            id="player_number"
            value={playerNumber}
            onChange={(e) => setPlayerNumber(e.target.value)}
            className="mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand tablet:text-sm"
            placeholder="Player or jersey #"
          />
        </div>
      </div>
      <div>
        <label htmlFor="notes" className="text-sm font-semibold text-ink">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand tablet:text-sm"
          placeholder="e.g. Tall fit preferred"
        />
      </div>
      <div>
        <label htmlFor="email" className="text-sm font-semibold text-ink">
          Email (optional)
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand tablet:text-sm"
          placeholder="So the coach can chase if needed"
        />
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="flex justify-stretch tablet:justify-end">
        <button
          type="button"
          onClick={submit}
          className="inline-flex w-full min-h-12 items-center justify-center rounded-md bg-ink px-5 py-3 text-base font-semibold text-white shadow-sm hover:opacity-95 tablet:w-auto tablet:py-2 tablet:text-sm"
        >
          {isBundle ? "Submit my sizes" : "Submit my size"}
        </button>
      </div>
    </div>
  )
}

export default JoinForm
