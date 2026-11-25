"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, usePathname } from "next/navigation"

import {
  getOrderMessages,
  getOrderRequests,
  reportOrderProblem,
  requestSizeSwap,
  sendOrderMessage,
  type CustomerRequest,
  type RequestLine,
  type RequestStatus,
  type Result,
  type ThreadMessage,
} from "@lib/data/job-requests"
import { uploadContactAttachment } from "@modules/contact/lib/upload-attachment"

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50"
const PRIMARY = `${BTN} bg-brand text-white hover:opacity-90`
const SECONDARY = `${BTN} border border-ui-border-base bg-white text-ui-fg-base hover:bg-ui-bg-subtle`
const FIELD = "w-full rounded-md border border-ui-border-base bg-white px-3 py-2 text-sm min-h-11"

const PROBLEMS: Array<[string, string]> = [
  ["wrong_item", "Wrong item"],
  ["wrong_size", "Wrong size"],
  ["print_fault", "Print fault"],
  ["damaged", "Damaged"],
  ["missing", "Missing items"],
  ["other", "Something else"],
]
const STATUS_LABEL: Record<RequestStatus, string> = {
  open: "Open",
  approved: "Approved",
  declined: "Declined",
  resolved: "Resolved",
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

const describe = (r: CustomerRequest) =>
  r.kind === "size_swap"
    ? `Size swap: ${r.quantity} from ${r.from_size} to ${r.to_size}`
    : `Problem: ${PROBLEMS.find(([k]) => k === r.problem)?.[1] ?? "Something else"}${r.details ? ` · ${r.details}` : ""}`

/**
 * Messages, "Something wrong?" and "Swap a size" for the order on screen.
 * Mounted by the server-safe Help card; renders nothing unless this is the
 * signed-in customer's own account order page.
 */
export default function HelpPortal() {
  const params = useParams<{ id?: string }>()
  const pathname = usePathname()
  const orderId = pathname?.includes("/account/orders/details/") ? params?.id : undefined
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null)
  const [data, setData] = useState<{ requests: CustomerRequest[]; lines: RequestLine[] } | null>(null)
  const [form, setForm] = useState<null | "problem" | "swap">(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const [text, setText] = useState("")
  const [what, setWhat] = useState("wrong_item")
  const [details, setDetails] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [lineId, setLineId] = useState("")
  const [fromSize, setFromSize] = useState("")
  const [toSize, setToSize] = useState("")
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState("")

  const reload = useCallback(async () => {
    if (!orderId) return
    const [m, r] = await Promise.all([getOrderMessages(orderId), getOrderRequests(orderId)])
    setMessages(m)
    setData(r)
  }, [orderId])
  useEffect(() => {
    void reload()
  }, [reload])

  if (!orderId || messages === null || data === null) return null

  const run = async (fn: () => Promise<Result>, okText: string, reset: () => void) => {
    setBusy(true)
    setError(null)
    setDone(null)
    const res = await fn()
    setBusy(false)
    if (!res.ok) return setError(res.error)
    reset()
    setDone(okText)
    setForm(null)
    await reload()
  }

  const sendMessage = () =>
    run(() => sendOrderMessage(orderId, text), "Sent. We'll reply by email.", () => setText(""))

  const sendProblem = () =>
    run(
      async () => {
        const uploaded = await Promise.all(files.map((f) => uploadContactAttachment(f)))
        if (uploaded.some((u) => !u)) return { ok: false, error: "A photo didn't upload. Please try again." }
        return reportOrderProblem(orderId, {
          what,
          details,
          line_item_ids: lineId ? [lineId] : [],
          photo_urls: uploaded.map((u) => u!.url),
        })
      },
      "Thanks. We've got it and will be in touch.",
      () => {
        setDetails("")
        setFiles([])
      }
    )

  const sendSwap = () =>
    run(
      () => requestSizeSwap(orderId, { line_item_id: lineId, from_size: fromSize, to_size: toSize, quantity: qty, note }),
      "Request sent. We'll check stock and get back to you.",
      () => {
        setFromSize("")
        setToSize("")
        setNote("")
      }
    )

  const chooseLine = (id: string) => {
    setLineId(id)
    const l = data.lines.find((x) => x.id === id)
    if (l?.variant_title) setFromSize(l.variant_title.split("/").pop()?.trim() ?? "")
    setQty(1)
  }

  return (
    <div className="mt-6 flex flex-col gap-4 border-t border-ui-border-base pt-6" data-testid="order-help-portal">
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink">Messages about this order</h4>
        {messages.length === 0 ? (
          <p className="text-sm text-ui-fg-subtle">No messages yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${m.from === "you" ? "self-end bg-white" : "self-start bg-ui-bg-base"} border border-ui-border-base`}
              >
                <div className="text-xs text-ui-fg-subtle">
                  {m.from === "you" ? "You" : "SC Prints"} · {when(m.at)}
                </div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </li>
            ))}
          </ul>
        )}
        <textarea
          className={`${FIELD} mt-3`}
          rows={3}
          maxLength={4000}
          placeholder="Write to us about this order"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className={`${PRIMARY} mt-2`} disabled={busy || !text.trim()} onClick={sendMessage}>
          Send message
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={SECONDARY} onClick={() => setForm(form === "problem" ? null : "problem")}>
          Something wrong?
        </button>
        <button className={SECONDARY} onClick={() => setForm(form === "swap" ? null : "swap")}>
          Swap a size
        </button>
      </div>

      {form === "problem" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-ui-border-base bg-white p-4">
          <select className={FIELD} value={what} onChange={(e) => setWhat(e.target.value)} aria-label="What is wrong">
            {PROBLEMS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select className={FIELD} value={lineId} onChange={(e) => setLineId(e.target.value)} aria-label="Which item">
            <option value="">Which item? (optional)</option>
            {data.lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
                {l.variant_title ? ` · ${l.variant_title}` : ""}
              </option>
            ))}
          </select>
          <textarea className={FIELD} rows={3} maxLength={2000} placeholder="Tell us what happened" value={details} onChange={(e) => setDetails(e.target.value)} />
          <input
            type="file"
            accept="image/*"
            multiple
            className="text-sm"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))}
          />
          <p className="m-0 text-xs text-ui-fg-subtle">Photos help a lot (up to 6).</p>
          <button className={PRIMARY} disabled={busy} onClick={sendProblem}>
            {busy ? "Sending…" : "Send to us"}
          </button>
        </div>
      ) : null}

      {form === "swap" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-ui-border-base bg-white p-4">
          <select className={FIELD} value={lineId} onChange={(e) => chooseLine(e.target.value)} aria-label="Which item">
            <option value="">Which item?</option>
            {data.lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
                {l.variant_title ? ` · ${l.variant_title}` : ""} (x{l.quantity})
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <input className={`${FIELD} flex-1`} placeholder="Size now" value={fromSize} maxLength={40} onChange={(e) => setFromSize(e.target.value)} />
            <input className={`${FIELD} flex-1`} placeholder="Size you want" value={toSize} maxLength={40} onChange={(e) => setToSize(e.target.value)} />
            <input
              className={`${FIELD} w-24`}
              type="number"
              min={1}
              max={data.lines.find((l) => l.id === lineId)?.quantity ?? 1}
              value={qty}
              aria-label="How many"
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <textarea className={FIELD} rows={2} maxLength={1000} placeholder="Anything else? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="m-0 text-xs text-ui-fg-subtle">
            We&apos;ll check stock and get back to you. Printed garments usually can&apos;t be swapped.
          </p>
          <button className={PRIMARY} disabled={busy || !lineId || !fromSize.trim() || !toSize.trim()} onClick={sendSwap}>
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      ) : null}

      {error ? <p className="m-0 text-sm text-red-600" role="alert">{error}</p> : null}
      {done ? <p className="m-0 text-sm text-ui-fg-base" role="status">{done}</p> : null}

      {data.requests.length ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink">Your requests</h4>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {data.requests.map((r) => (
              <li key={r.id} className="rounded-lg border border-ui-border-base bg-white px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span>{describe(r)}</span>
                  <span className="shrink-0 text-xs font-semibold">{STATUS_LABEL[r.status]}</span>
                </div>
                {r.staff_note ? <div className="mt-1 text-xs text-ui-fg-subtle">SC Prints: {r.staff_note}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
