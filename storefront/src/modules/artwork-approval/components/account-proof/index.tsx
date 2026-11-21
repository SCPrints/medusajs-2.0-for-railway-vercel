"use client"

import { useEffect, useState } from "react"

import { decideMyProof, getMyApprovalLink, getMyProof, type MyProof } from "@lib/data/proofs"
import PinBoard from "@modules/artwork-approval/components/pin-board"
import type { ProofPin } from "@modules/artwork-approval/lib/pins"

const FIELD =
  "mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base focus:border-brand focus:outline-hidden focus:ring-1 focus:ring-brand tablet:text-sm"
const BTN = "inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-60"

/**
 * Approve the proof from the account (with optional pins). Shown only while
 * the proof is waiting on the customer; renders nothing otherwise, or when the
 * order isn't the signed-in customer's. Also lets them pass the signed link to
 * whoever signs artwork off: we send nothing, their own mail app does.
 */
const AccountProof = ({ orderId }: { orderId: string }) => {
  const [proof, setProof] = useState<MyProof | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [comment, setComment] = useState("")
  const [pins, setPins] = useState<ProofPin[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    getMyProof(orderId).then((p) => {
      if (!live) return
      setProof(p)
      if (p?.waiting) getMyApprovalLink(orderId).then((u) => live && setLink(u))
    })
    return () => {
      live = false
    }
  }, [orderId])

  if (done) {
    return (
      <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        {done === "approved"
          ? "Thanks, artwork approved. We're getting on with production."
          : "Thanks, we've got your changes and will send a new proof."}
      </div>
    )
  }
  if (!proof?.waiting) return null

  const images =
    proof.mockup_urls.length > 0
      ? proof.mockup_urls.map((m) => ({ url: m.url, label: m.side_label ?? m.side }))
      : proof.latest_photo_url
        ? [{ url: proof.latest_photo_url, label: "Proof" }]
        : []

  const submit = async (approved: boolean) => {
    setBusy(true)
    setError(null)
    const res = await decideMyProof(orderId, {
      approved,
      approver_name: name.trim() || undefined,
      comment: comment.trim() || undefined,
      pins: approved ? undefined : pins,
    })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setDone(res.status)
  }

  const copy = async () => {
    if (!link) return setError("We couldn't make a link just now. Please refresh and try again.")
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setError("Couldn't copy. Use the Email it link instead.")
    }
  }
  const mailto = link
    ? `mailto:?subject=${encodeURIComponent(`Please approve our artwork proof (order #${proof.order_display_id ?? ""})`)}&body=${encodeURIComponent(`Can you look over this artwork proof and approve it?\n\n${link}`)}`
    : null

  return (
    <div className="mt-4 rounded-lg border border-amber-300 bg-white p-4" data-testid="account-proof">
      <h3 className="text-sm font-semibold text-ui-fg-base">Check your artwork proof</h3>
      <p className="mt-1 text-xs text-ui-fg-subtle">
        Tap the picture to mark a spot that needs changing, or just write a note.
      </p>

      <div className="mt-3">
        <PinBoard images={images} pins={pins} onChange={setPins} />
      </div>

      <label htmlFor="proof-name" className="mt-4 block text-sm font-semibold text-ui-fg-base">
        Your name
      </label>
      <input id="proof-name" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} placeholder="So we know who signed it off" maxLength={200} />

      <label htmlFor="proof-comment" className="mt-3 block text-sm font-semibold text-ui-fg-base">
        Notes (optional)
      </label>
      <textarea id="proof-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={2000} className={FIELD} />

      {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-4 flex flex-col gap-2 tablet:flex-row tablet:justify-end">
        <button type="button" disabled={busy} onClick={() => submit(false)} className={`${BTN} border border-ui-border-base bg-white text-ui-fg-base hover:bg-ui-bg-subtle`}>
          Request changes
        </button>
        <button type="button" disabled={busy} onClick={() => submit(true)} className={`${BTN} bg-ink text-white hover:opacity-90`}>
          Approve and send to print
        </button>
      </div>

      <div className="mt-5 border-t border-ui-border-base pt-3">
        <p className="text-sm font-semibold text-ui-fg-base">Someone else needs to approve this?</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={copy} className={`${BTN} border border-ui-border-base bg-white text-ui-fg-base hover:bg-ui-bg-subtle`}>
            {copied ? "Link copied" : "Copy link"}
          </button>
          {mailto ? (
            <a href={mailto} className={`${BTN} border border-ui-border-base bg-white text-ui-fg-base hover:bg-ui-bg-subtle`}>
              Email it
            </a>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-ui-fg-subtle">Anyone with the link can approve, so only send it to people you trust.</p>
      </div>
    </div>
  )
}

export default AccountProof
