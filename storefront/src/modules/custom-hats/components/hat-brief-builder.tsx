"use client"

import { useId, useRef, useState } from "react"

import {
  CAP_STYLES,
  HTV_FILMS,
  LOCATIONS,
  LOCATION_LABEL,
  METHOD_GROUPS,
  METHOD_LABEL,
  PATCH_ATTACHMENTS,
  TRIM_OPTIONS,
  TRIM_LABEL,
} from "../data"

// Mood-board limits mirror the BYO form so a permitted submission never 413s at
// the /api/quote proxy (28 MB cap). Keep in step with byo-inquiry-form.tsx.
const MAX_MOOD_BOARD = 5
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_BYTES = 20 * 1024 * 1024

const dataUrlRawBytes = (dataUrl: string): number => {
  const comma = dataUrl.indexOf(",")
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  return Math.floor((b64.length * 3) / 4)
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const v = r.result
      if (typeof v === "string") resolve(v)
      else reject(new Error("FileReader returned non-string result"))
    }
    r.onerror = reject
    r.readAsDataURL(file)
  })

type MoodBoardImage = {
  id: string
  filename: string
  mime_type: string
  data_base64: string
  preview_url: string
}

type Decoration = {
  id: string
  location: string
  method: string
  detail: string
}

const inputClass =
  "w-full rounded-lg border border-[var(--brand-primary)]/35 bg-white px-3 py-2.5 text-sm text-ui-fg-base placeholder:text-ui-fg-muted/80 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
const labelClass = "mb-1.5 block text-xs font-semibold text-ui-fg-base"

// A helpful placeholder for the free-text detail, tailored to the chosen method.
const detailPlaceholder = (method: string): string => {
  if (method.startsWith("patch-")) {
    return `Size + attachment — e.g. "75mm woven, ${PATCH_ATTACHMENTS.join(" / ")}"`
  }
  if (method === "htv") {
    return `Colour + film — e.g. "white, or specialty: ${HTV_FILMS.join(" / ")}"`
  }
  if (method === "flat-embroidery" || method === "3d-puff" || method === "tone-on-tone" || method === "applique" || method === "chenille") {
    return `Thread colours + size — e.g. "3 colours, ~60mm wide"`
  }
  return `Colours, size, any notes — e.g. "full colour, ~80mm"`
}

let seq = 0
const newId = () => `dec-${Date.now()}-${seq++}`

export default function HatBriefBuilder({ id }: { id?: string }) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [capStyle, setCapStyle] = useState("")
  const [capColours, setCapColours] = useState("")
  const [quantity, setQuantity] = useState("")
  const [decorations, setDecorations] = useState<Decoration[]>([
    { id: newId(), location: "front", method: "", detail: "" },
  ])
  const [trims, setTrims] = useState<Set<string>>(() => new Set())
  const [moodBoard, setMoodBoard] = useState<MoodBoardImage[]>([])
  const moodInputRef = useRef<HTMLInputElement | null>(null)
  const formTitleId = useId()

  const addDecoration = () =>
    setDecorations((prev) => [...prev, { id: newId(), location: "front", method: "", detail: "" }])
  const removeDecoration = (rid: string) =>
    setDecorations((prev) => (prev.length > 1 ? prev.filter((d) => d.id !== rid) : prev))
  const patchDecoration = (rid: string, patch: Partial<Decoration>) =>
    setDecorations((prev) => prev.map((d) => (d.id === rid ? { ...d, ...patch } : d)))

  const toggleTrim = (tid: string) =>
    setTrims((prev) => {
      const next = new Set(prev)
      next.has(tid) ? next.delete(tid) : next.add(tid)
      return next
    })

  const addImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const next: MoodBoardImage[] = []
    let runningTotal = moodBoard.reduce((sum, m) => sum + dataUrlRawBytes(m.data_base64), 0)
    for (const file of Array.from(files)) {
      if (moodBoard.length + next.length >= MAX_MOOD_BOARD) break
      if (!file.type.startsWith("image/")) continue
      if (file.size > MAX_FILE_BYTES) {
        alert(`${file.name} is larger than 8 MB — skipping.`)
        continue
      }
      if (runningTotal + file.size > MAX_TOTAL_BYTES) {
        alert("Artwork total is over 20 MB — remove an image or use smaller files.")
        break
      }
      runningTotal += file.size
      try {
        const dataUrl = await fileToDataUrl(file)
        next.push({
          id: `${Date.now()}-${file.name}`,
          filename: file.name,
          mime_type: file.type,
          data_base64: dataUrl,
          preview_url: dataUrl,
        })
      } catch {
        // skip
      }
    }
    if (next.length > 0) setMoodBoard((prev) => [...prev, ...next])
    if (moodInputRef.current) moodInputRef.current.value = ""
  }
  const removeImage = (iid: string) => setMoodBoard((prev) => prev.filter((m) => m.id !== iid))

  const activeDecorations = () => decorations.filter((d) => d.method)

  const buildMessage = (contactMessage: string): string => {
    const capLabel = CAP_STYLES.find((c) => c.id === capStyle)?.label ?? "Not specified"
    const lines: string[] = [
      `Base cap: ${capLabel}`,
      capColours.trim() ? `Cap colours: ${capColours.trim()}` : null,
      quantity.trim() ? `Quantity: ${quantity.trim()}` : null,
      "",
      "Decorations:",
      ...activeDecorations().map(
        (d) =>
          `  • ${LOCATION_LABEL[d.location]} — ${METHOD_LABEL[d.method]}${d.detail.trim() ? ` (${d.detail.trim()})` : ""}`
      ),
    ].filter((l): l is string => l !== null)

    if (trims.size > 0) {
      lines.push("", "Structural / trim add-ons:")
      TRIM_OPTIONS.filter((t) => trims.has(t.id)).forEach((t) => lines.push(`  • ${t.label}`))
    }
    if (contactMessage.trim()) {
      lines.push("", contactMessage.trim())
    }
    return lines.join("\n")
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const first = String(data.get("first-name") ?? "").trim()
    const last = String(data.get("last-name") ?? "").trim()
    const email = String(data.get("email") ?? "").trim()
    const phone = String(data.get("phone") ?? "").trim()
    const company = String(data.get("company") ?? "").trim()
    const timeline = String(data.get("timeline") ?? "").trim()
    const contactMessage = String(data.get("message") ?? "").trim()

    if (!capStyle) {
      alert("Please choose a base cap style.")
      return
    }
    if (activeDecorations().length === 0) {
      alert("Please add at least one decoration (pick a location + method).")
      return
    }

    setLoading(true)

    const lineItems = [
      ...activeDecorations().map((d) => ({
        title: `${LOCATION_LABEL[d.location]} — ${METHOD_LABEL[d.method]}`,
        description: d.detail.trim() || undefined,
        quantity: quantity.trim() ? Number(quantity) || undefined : undefined,
      })),
      ...TRIM_OPTIONS.filter((t) => trims.has(t.id)).map((t) => ({
        title: `Trim: ${t.label}`,
      })),
    ]

    const payload = {
      email,
      contact_name: `${first} ${last}`.trim() || null,
      contact_phone: phone || null,
      company: company || null,
      subject: "Custom hat request",
      source: "custom_hats" as const,
      message: buildMessage(contactMessage),
      line_items: lineItems,
      mood_board: moodBoard.map((m) => ({
        filename: m.filename,
        mime_type: m.mime_type,
        data_base64: m.data_base64,
      })),
      // Structured brief so the admin/quote can reconstruct exact selections.
      metadata: {
        hat_brief: {
          cap_style: capStyle,
          cap_colours: capColours.trim() || null,
          quantity: quantity.trim() || null,
          timeline: timeline || null,
          decorations: activeDecorations().map((d) => ({
            location: d.location,
            method: d.method,
            detail: d.detail.trim() || null,
          })),
          trims: TRIM_OPTIONS.filter((t) => trims.has(t.id)).map((t) => t.id),
        },
      },
    }

    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (response.ok) {
        setSuccess(true)
        form.reset()
        setCapStyle("")
        setCapColours("")
        setQuantity("")
        setDecorations([{ id: newId(), location: "front", method: "", detail: "" }])
        setTrims(new Set())
        setMoodBoard([])
      } else {
        const body = await response.json().catch(() => null)
        alert(body?.message ?? "Request could not be sent right now. Please try again shortly.")
      }
    } catch (err) {
      console.error(err)
      alert("Failed to send request. Please try again shortly.")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div
        id={id}
        className={`rounded-2xl border border-[var(--brand-primary)]/25 bg-white p-6 text-center${id ? " scroll-mt-28" : ""}`}
        aria-labelledby={formTitleId}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 id={formTitleId} className="text-lg font-semibold text-ui-fg-base">
          Brief received
        </h3>
        <p className="mt-2 text-sm text-ui-fg-subtle">
          We&apos;ll review your custom hat brief and send a quote and timeline shortly.
        </p>
        <button
          type="button"
          onClick={() => setSuccess(false)}
          className="mt-5 text-sm font-semibold text-[var(--brand-secondary)] underline hover:text-[var(--brand-accent)]"
        >
          Start another hat
        </button>
      </div>
    )
  }

  return (
    <form
      id={id}
      onSubmit={handleSubmit}
      className={`space-y-8${id ? " scroll-mt-28" : ""}`}
      aria-label="Custom hat brief builder"
    >
      {/* 1. Base cap */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-[var(--brand-primary)]">1. Base cap</legend>
        <div>
          <label className={labelClass}>Cap style</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CAP_STYLES.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition ${
                  capStyle === c.id
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5"
                    : "border-ui-border-base hover:border-[var(--brand-primary)]/50"
                }`}
              >
                <span className="flex items-center gap-2 font-medium text-ui-fg-base">
                  <input
                    type="radio"
                    name="cap-style"
                    value={c.id}
                    checked={capStyle === c.id}
                    onChange={() => setCapStyle(c.id)}
                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  {c.label}
                </span>
                <span className="pl-6 text-xs text-ui-fg-subtle">{c.blurb}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="hat-colours" className={labelClass}>Cap colours (panels, brim, closure)</label>
            <input id="hat-colours" name="colours" type="text" value={capColours} onChange={(e) => setCapColours(e.target.value)} placeholder='e.g. "black crown, tan brim"' className={inputClass} />
          </div>
          <div>
            <label htmlFor="hat-qty" className={labelClass}>Quantity</label>
            <input id="hat-qty" name="qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 50" className={inputClass} />
          </div>
        </div>
      </fieldset>

      {/* 2. Decorations */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-[var(--brand-primary)]">2. Decorations</legend>
        <p className="text-xs text-ui-fg-subtle">Add a block per logo/graphic. Choose where it goes and how it&apos;s decorated.</p>
        <div className="space-y-3">
          {decorations.map((d, i) => (
            <div key={d.id} className="rounded-lg border border-ui-border-base bg-ui-bg-subtle/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-ui-fg-subtle">Decoration {i + 1}</span>
                {decorations.length > 1 && (
                  <button type="button" onClick={() => removeDecoration(d.id)} className="text-xs font-medium text-ui-fg-muted underline hover:text-ui-fg-base">
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Location</label>
                  <select value={d.location} onChange={(e) => patchDecoration(d.id, { location: e.target.value })} className={inputClass}>
                    {LOCATIONS.map((l) => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Method</label>
                  <select value={d.method} onChange={(e) => patchDecoration(d.id, { method: e.target.value })} className={inputClass}>
                    <option value="">Select a method…</option>
                    {METHOD_GROUPS.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.methods.map((m) => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <label className={labelClass}>Details</label>
                <input
                  type="text"
                  value={d.detail}
                  onChange={(e) => patchDecoration(d.id, { detail: e.target.value })}
                  placeholder={detailPlaceholder(d.method)}
                  className={inputClass}
                />
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addDecoration} className="text-sm font-semibold text-[var(--brand-secondary)] underline hover:text-[var(--brand-accent)]">
          + Add another decoration
        </button>
      </fieldset>

      {/* 3. Structural / trim */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-[var(--brand-primary)]">3. Structural &amp; trim add-ons <span className="font-normal text-ui-fg-subtle">(optional)</span></legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TRIM_OPTIONS.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm text-ui-fg-base">
              <input type="checkbox" checked={trims.has(t.id)} onChange={() => toggleTrim(t.id)} className="h-4 w-4 rounded border-[var(--brand-primary)]/40 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* 4. Artwork */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-[var(--brand-primary)]">4. Artwork &amp; references <span className="font-normal text-ui-fg-subtle">(optional, up to {MAX_MOOD_BOARD})</span></legend>
        <p className="text-xs text-ui-fg-subtle">Logos, sketches, brand references, or photos of a look you&apos;re after. Faster quotes, fewer rounds.</p>
        <div className="flex flex-wrap items-start gap-2">
          {moodBoard.map((m) => (
            <div key={m.id} className="relative h-20 w-20 overflow-hidden rounded-md border border-[var(--brand-primary)]/20 bg-ui-bg-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.preview_url} alt={m.filename} className="h-full w-full object-cover" />
              <button type="button" onClick={() => removeImage(m.id)} className="absolute right-0 top-0 m-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80" aria-label={`Remove ${m.filename}`}>
                ×
              </button>
            </div>
          ))}
          {moodBoard.length < MAX_MOOD_BOARD && (
            <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed border-[var(--brand-primary)]/40 text-xs text-ui-fg-subtle hover:bg-ui-bg-subtle">
              + Add
              <input ref={moodInputRef} type="file" accept="image/*" multiple onChange={(e) => addImages(e.target.files)} className="hidden" />
            </label>
          )}
        </div>
      </fieldset>

      {/* 5. Your details */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-[var(--brand-primary)]">5. Your details</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="hat-first" className={labelClass}>First name</label>
            <input id="hat-first" name="first-name" type="text" autoComplete="given-name" className={inputClass} />
          </div>
          <div>
            <label htmlFor="hat-last" className={labelClass}>Last name</label>
            <input id="hat-last" name="last-name" type="text" autoComplete="family-name" className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="hat-email" className={labelClass}>Email</label>
            <input id="hat-email" name="email" type="email" autoComplete="email" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="hat-phone" className={labelClass}>Phone <span className="font-normal text-ui-fg-subtle">(optional)</span></label>
            <input id="hat-phone" name="phone" type="tel" autoComplete="tel" className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="hat-company" className={labelClass}>Company / team <span className="font-normal text-ui-fg-subtle">(optional)</span></label>
            <input id="hat-company" name="company" type="text" autoComplete="organization" className={inputClass} />
          </div>
          <div>
            <label htmlFor="hat-timeline" className={labelClass}>In-hands date <span className="font-normal text-ui-fg-subtle">(optional)</span></label>
            <input id="hat-timeline" name="timeline" type="text" placeholder='e.g. "mid August"' className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="hat-message" className={labelClass}>Anything else?</label>
          <textarea id="hat-message" name="message" rows={4} className={`${inputClass} resize-y`} placeholder="Context, budget, sizing mix, or questions." />
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[var(--brand-primary)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Sending…" : "Send my hat brief"}
      </button>
      <p className="text-center text-xs text-ui-fg-subtle">
        No payment now — we review your brief and send a quote and timeline.
      </p>
    </form>
  )
}
