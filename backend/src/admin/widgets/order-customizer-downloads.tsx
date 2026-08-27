import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { withWidgetBoundary } from "../components/widget-error-boundary"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Input, Select, Text, Textarea } from "@medusajs/ui"
import { ChevronDown, XMark } from "@medusajs/icons"
import { useCallback, useEffect, useRef, useState } from "react"

import { HelpTooltip } from "../components/reports/help-tooltip"
import type { RevisedProof } from "../../api/admin/orders/[id]/revised-proof/route"

/** Fetches a cross-origin URL as a blob and triggers a native Save dialog. */
function triggerBlobDownload(url: string, fileName: string): Promise<void> {
  return fetch(url, { mode: "cors", credentials: "omit" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.blob()
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objectUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
    })
}

function DownloadLink({
  href,
  fileName,
  label,
}: {
  href: string
  fileName: string
  label: string
}) {
  const [state, setState] = useState<"idle" | "downloading" | "error">("idle")

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setState("downloading")
    triggerBlobDownload(href, fileName)
      .then(() => setState("idle"))
      .catch(() => {
        // CORS blocked or network error — fall back to new tab
        window.open(href, "_blank", "noreferrer")
        setState("idle")
      })
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className="text-small text-blue-600 hover:underline break-all"
    >
      {state === "downloading" ? "Downloading…" : label}
    </a>
  )
}

function adminCustomizerDownloadPath(orderId: string) {
  return `/admin/orders/${orderId}/customizer-download`
}
function adminProofPath(orderId: string) {
  return `/admin/orders/${orderId}/revised-proof`
}
function adminMockupNotePath(orderId: string) {
  return `/admin/orders/${orderId}/mockup-note`
}
function adminPrintDimensionPath(orderId: string) {
  return `/admin/orders/${orderId}/print-dimension`
}
function adminProofNotesPath(orderId: string) {
  return `/admin/orders/${orderId}/proof-notes`
}

/** Heuristic: does this text look like it contains a print size? Used only to
 *  nudge staff when proof notes may contradict the structured dimension fields. */
const SIZE_TOKEN_RE = /(\bA[3-6]\b|\d+\s*(?:mm|cm)\b|\d+\s*[x×*]\s*\d+)/i
function looksLikeSize(text: string): boolean {
  return SIZE_TOKEN_RE.test(text)
}

type ArtifactPayload = {
  side: string
  side_label: string
  print_url: string | null
  print_url_inline_omitted?: boolean
  mockup_url: string | null
  mockup_url_inline_omitted?: boolean
}

type LinePayload = {
  line_item_id: string
  product_title: string | null
  variant_title: string | null
  title: string | null
  quantity: number
  has_customizer: boolean
  print_notes: string | null
  artifacts: ArtifactPayload[]
  customer_original_files?: Array<{
    url: string
    file_name: string
    mime_type: string
    sides?: string[]
  }>
  product_handle?: string | null
  variant_id?: string | null
}

type DownloadPayload = {
  order_id?: string
  display_id?: number | string | null
  lines?: LinePayload[]
}

// ─── Filename helpers ────────────────────────────────────────────────────────

const BRAND_PREFIXES = [
  "as-colour-",
  "aussie-pacific-",
  "biz-collection-",
  "biz-care-",
  "biz-corporates-",
  "syzmik-",
  "fashionbiz-",
  "good-mates-",
]

function garmentCodeFromHandle(handle: string | null | undefined): string {
  if (!handle) return "product"
  for (const prefix of BRAND_PREFIXES) {
    if (handle.startsWith(prefix)) return handle.slice(prefix.length)
  }
  // Unknown handle: use last hyphen-segment
  return handle.split("-").pop() || handle
}

function slugify(str: string): string {
  return str
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 30)
}

/**
 * Builds a filename following the convention:
 *   {order#}-{customer}-{printposition}-{garmentcode}[-{suffix}].{ext}
 */
function buildFileName({
  displayId,
  customerSlug,
  side,
  garmentCode,
  suffix,
  ext,
}: {
  displayId: string
  customerSlug: string
  side: string
  garmentCode: string
  suffix?: string
  ext: string
}): string {
  const parts = [displayId, customerSlug, side, garmentCode]
  if (suffix) parts.push(suffix)
  return `${parts.join("-")}.${ext}`
}

/**
 * File extension matching what the href actually serves — the artwork slot can
 * hold the customer's original (svg/jpg/png) or a rendered print PNG, and a
 * download saved as `.png` that's really SVG markup won't open anywhere.
 */
function extFromArtworkUrl(url: string | null | undefined, mimeType?: string | null): string {
  if (mimeType === "image/svg+xml") return "svg"
  if (mimeType === "image/jpeg") return "jpg"
  const path = (url ?? "").split("?")[0].toLowerCase()
  if (path.endsWith(".svg")) return "svg"
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "jpg"
  return "png"
}

function sideKey(lineItemId: string, side: string) {
  return `${lineItemId}:${side}`
}

function lineHeading(line: LinePayload) {
  const product = line.product_title || line.title || "Product"
  const variant =
    line.variant_title && typeof line.variant_title === "string" ? line.variant_title : null
  return variant ? `${product} · ${variant}` : product
}

function formatDate(iso: string): string {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return "—"
  return new Date(ts).toLocaleString()
}

// ─── Per-side mockup + proof history card ────────────────────────────────────

type SideProofCardProps = {
  orderId: string
  lineItemId: string
  art: ArtifactPayload
  proofsForSide: RevisedProof[]
  customerOriginalFileUrl?: string | null
  onProofsChange: (updated: RevisedProof[]) => void
  onCustomisePosition: ((artworkUrl: string | null) => void) | null
  /** Naming context for downloaded files */
  displayId: string
  customerSlug: string
  garmentCode: string
  /** Staff studio note shown under this side's mockup on the approval page. */
  studioNote: string
  onStudioNoteSaved: (note: string) => void
  /** Staff print-dimension override shown under this side's mockup (PDF + approval page). */
  printDimension: string
  onPrintDimensionSaved: (dimension: string) => void
}

const SideProofCard = ({
  orderId,
  lineItemId,
  art,
  proofsForSide,
  customerOriginalFileUrl,
  onProofsChange,
  onCustomisePosition,
  displayId,
  customerSlug,
  garmentCode,
  studioNote,
  onStudioNoteSaved,
  printDimension,
  onPrintDimensionSaved,
}: SideProofCardProps) => {
  const key = sideKey(lineItemId, art.side)

  // Studio note (per side) — shown to the customer under this mockup on the
  // approval page. Persisted independently of revised proofs.
  const [noteDraft, setNoteDraft] = useState<string>(studioNote)
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  // Re-sync the draft if the persisted note changes (e.g. after a reload).
  useEffect(() => {
    setNoteDraft(studioNote)
  }, [studioNote])

  const handleSaveNote = useCallback(async () => {
    const next = noteDraft.trim()
    setNoteSaving(true)
    setNoteError(null)
    setNoteSaved(false)
    try {
      const res = await fetch(adminMockupNotePath(orderId), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ line_item_id: lineItemId, side: art.side, note: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      onStudioNoteSaved(next)
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2500)
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setNoteSaving(false)
    }
  }, [noteDraft, orderId, lineItemId, art.side, onStudioNoteSaved])

  // Print dimension (per side) — overrides the order-time print-size band on
  // BOTH the Mockup PDF and the customer approval page. Free text so it can
  // hold a measured size ("8.75×3.5cm") or a format note ("A3 format").
  const [dimDraft, setDimDraft] = useState<string>(printDimension)
  const [dimSaving, setDimSaving] = useState(false)
  const [dimSaved, setDimSaved] = useState(false)
  const [dimError, setDimError] = useState<string | null>(null)

  useEffect(() => {
    setDimDraft(printDimension)
  }, [printDimension])

  const handleSaveDimension = useCallback(async () => {
    const next = dimDraft.trim()
    setDimSaving(true)
    setDimError(null)
    setDimSaved(false)
    try {
      const res = await fetch(adminPrintDimensionPath(orderId), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ line_item_id: lineItemId, side: art.side, dimension: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      onPrintDimensionSaved(next)
      setDimSaved(true)
      setTimeout(() => setDimSaved(false), 2500)
    } catch (err) {
      setDimError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setDimSaving(false)
    }
  }, [dimDraft, orderId, lineItemId, art.side, onPrintDimensionSaved])

  // Default to latest proof, or "original"
  const [selected, setSelected] = useState<string>(
    proofsForSide.length > 0 ? proofsForSide[proofsForSide.length - 1].id : "original"
  )
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Keep selected in sync when proofs reload
  useEffect(() => {
    setSelected(
      proofsForSide.length > 0 ? proofsForSide[proofsForSide.length - 1].id : "original"
    )
  }, [proofsForSide])

  const selectedProof = proofsForSide.find((p) => p.id === selected)

  // What mockup image to show (right column)
  const displayedMockupUrl =
    selected === "original"
      ? art.mockup_url
      : (selectedProof?.url ?? art.mockup_url)

  // What artwork to show (left column) — proof artwork_url, or original upload, or print PNG
  const displayedArtworkUrl =
    selected === "original"
      ? (customerOriginalFileUrl ?? art.print_url)
      : (selectedProof?.artwork_url ?? selectedProof?.url ?? customerOriginalFileUrl ?? art.print_url)

  // Artwork URL to pre-load into the customiser (latest proof artwork, or original upload, or print PNG)
  const artworkForCustomiser =
    selectedProof?.artwork_url ?? customerOriginalFileUrl ?? art.print_url ?? null

  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = useCallback(
    async (proofId: string) => {
      setDeletingId(proofId)
      setDeleteError(null)
      try {
        const res = await fetch(`${adminProofPath(orderId)}?id=${encodeURIComponent(proofId)}`, {
          method: "DELETE",
          credentials: "include",
          headers: { Accept: "application/json" },
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error ?? body?.message ?? `HTTP ${res.status}`)
        onProofsChange(body.proofs ?? [])
        setSelected("original")
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Delete failed")
      } finally {
        setDeletingId(null)
      }
    },
    [orderId, onProofsChange]
  )

  return (
    <li
      key={key}
      className="rounded-md bg-ui-bg-subtle px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
        <Text size="xsmall" weight="plus">
          {art.side_label}
        </Text>
        {art.print_url_inline_omitted ? (
          <Badge size="2xsmall" color="orange">Print file too large (inline)</Badge>
        ) : null}
        {art.mockup_url_inline_omitted ? (
          <Badge size="2xsmall" color="orange">Mockup too large (inline)</Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left column — artwork (upload or proof artwork) */}
        <div className="rounded-lg border border-ui-border-base bg-ui-bg-base overflow-hidden flex flex-col">
          {displayedArtworkUrl ? (
            <img
              src={displayedArtworkUrl}
              alt={`Artwork ${art.side_label}`}
              className="mx-auto block max-h-48 w-auto object-contain bg-ui-bg-component p-2"
            />
          ) : (
            <div className="h-48 bg-ui-bg-component flex items-center justify-center">
              <Text size="xsmall" className="text-ui-fg-muted">No artwork</Text>
            </div>
          )}
          <div className="border-t border-ui-border-base px-3 py-2 flex flex-col gap-y-2 flex-1">
            <Text size="xsmall" className="text-ui-fg-subtle">
              {selected === "original"
                ? customerOriginalFileUrl
                  ? `Customer original file (${extFromArtworkUrl(customerOriginalFileUrl).toUpperCase()})`
                  : "Rendered print file (PNG)"
                : "Proof artwork"}
            </Text>
            {displayedArtworkUrl && (
              <DownloadLink
                href={displayedArtworkUrl}
                fileName={buildFileName({
                  displayId,
                  customerSlug,
                  side: art.side,
                  garmentCode,
                  suffix: selected === "original" ? undefined : "proof",
                  ext: extFromArtworkUrl(displayedArtworkUrl),
                })}
                label="Download artwork"
              />
            )}

            {/* Customise position — single action, routes all proof creation through the iframe */}
            {onCustomisePosition ? (
              <div className="border-t border-ui-border-base pt-2 mt-auto">
                <Button
                  variant="secondary"
                  size="small"
                  className="w-full"
                  onClick={() => onCustomisePosition(artworkForCustomiser)}
                >
                  {proofsForSide.length > 0 ? "Customise proof position" : "Create revised proof"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right column — garment mockup + proof history */}
        {art.mockup_url || proofsForSide.length > 0 ? (
          <div className="rounded-lg border border-ui-border-base bg-ui-bg-base overflow-hidden flex flex-col">
            {displayedMockupUrl ? (
              <img
                src={displayedMockupUrl}
                alt={`Garment preview ${art.side_label}`}
                className="mx-auto block max-h-48 w-auto object-contain bg-ui-bg-component p-2"
              />
            ) : (
              <div className="h-48 bg-ui-bg-component flex items-center justify-center">
                <Text size="xsmall" className="text-ui-fg-muted">No mockup</Text>
              </div>
            )}

            <div className="border-t border-ui-border-base px-3 py-2 flex flex-col gap-y-2 flex-1">
              {/* History dropdown — only when there are proofs */}
              {proofsForSide.length > 0 ? (
                <div className="flex items-center gap-x-2">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={selected}
                      onValueChange={(v) => setSelected(v)}
                    >
                      <Select.Trigger>
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="original">Original mockup</Select.Item>
                        {[...proofsForSide].reverse().map((p) => (
                          <Select.Item key={p.id} value={p.id}>
                            {p.note ? `${p.note} · ` : ""}{formatDate(p.uploaded_at)}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </div>
                  {selected !== "original" && (
                    <Button
                      size="small"
                      variant="transparent"
                      className="text-ui-fg-error hover:text-ui-fg-error shrink-0"
                      disabled={deletingId === selected}
                      onClick={() => handleDelete(selected)}
                    >
                      {deletingId === selected ? "Removing…" : "Remove"}
                    </Button>
                  )}
                </div>
              ) : null}
              {deleteError && (
                <Text size="xsmall" className="text-ui-fg-error">{deleteError}</Text>
              )}

              {/* Mockup label + download link */}
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {selected === "original" ? "Garment mockup (JPEG)" : "Revised mockup"}
                </Text>
                {displayedMockupUrl && (
                  <DownloadLink
                    href={displayedMockupUrl}
                    fileName={buildFileName({
                      displayId,
                      customerSlug,
                      side: art.side,
                      garmentCode,
                      suffix: selected === "original" ? "mockup" : "proof-mockup",
                      ext: "jpg",
                    })}
                    label={`Download ${selected === "original" ? "mockup" : "revised mockup"}`}
                  />
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Print dimension — overrides the order-time size band on the Mockup PDF
          AND the customer approval page. Leave blank to use the band. */}
      <div className="mt-3 border-t border-ui-border-base pt-3">
        <Text size="xsmall" weight="plus">
          Print dimensions for {art.side_label}
        </Text>
        <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
          Shown under this mockup on the proof PDF and customer approval page. Overrides the
          order-time size. Leave blank to use the size the customer picked.
        </Text>
        <div className="mt-2 flex items-center gap-x-2">
          <Input
            value={dimDraft}
            onChange={(e) => setDimDraft(e.target.value)}
            maxLength={100}
            placeholder="e.g. 8.75×3.5cm or A3 format"
            className="flex-1"
          />
          <Button
            size="small"
            variant="secondary"
            disabled={dimSaving || dimDraft.trim() === printDimension.trim()}
            onClick={handleSaveDimension}
          >
            {dimSaving ? "Saving…" : "Save"}
          </Button>
        </div>
        <div className="mt-1 flex items-center gap-x-2">
          {dimSaved ? (
            <Text size="xsmall" className="text-ui-fg-subtle">Saved ✓</Text>
          ) : null}
          {dimError ? (
            <Text size="xsmall" className="text-ui-fg-error">{dimError}</Text>
          ) : null}
        </div>
      </div>

      {/* Studio note — shown to the customer UNDER this mockup on the approval page */}
      <div className="mt-3 border-t border-ui-border-base pt-3">
        <Text size="xsmall" weight="plus">
          Studio note for {art.side_label}
        </Text>
        <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
          Shown to the customer under this mockup on the approval page (leave blank for none).
        </Text>
        <Textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Logo sits 8cm below the cuff — check placement before approving."
          className="mt-2"
        />
        <div className="mt-2 flex items-center gap-x-2">
          <Button
            size="small"
            variant="secondary"
            disabled={noteSaving || noteDraft.trim() === studioNote.trim()}
            onClick={handleSaveNote}
          >
            {noteSaving ? "Saving…" : "Save note"}
          </Button>
          {noteSaved ? (
            <Text size="xsmall" className="text-ui-fg-subtle">Saved ✓</Text>
          ) : null}
          {noteError ? (
            <Text size="xsmall" className="text-ui-fg-error">{noteError}</Text>
          ) : null}
        </div>
      </div>
    </li>
  )
}

// ─── Customiser iframe modal ──────────────────────────────────────────────────

type CustomiserModalProps = {
  src: string
  onClose: () => void
}

const CustomiserModal = ({ src, onClose }: CustomiserModalProps) => (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6"
    onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
  >
    <div className="flex flex-col w-full max-w-6xl rounded-xl overflow-hidden shadow-2xl border border-ui-border-base"
      style={{ height: "90vh" }}
    >
      <div className="flex items-center justify-between bg-ui-bg-base px-4 py-2 border-b border-ui-border-base shrink-0">
        <Text size="small" weight="plus">Customise proof position — adjust artwork, then click Save Proof</Text>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded px-2 py-1 text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-subtle"
          aria-label="Close customiser"
        >
          <XMark />
          <span className="text-xsmall">Close</span>
        </button>
      </div>
      <iframe
        src={src}
        className="flex-1 w-full border-0 bg-white"
        allow="clipboard-read; clipboard-write"
        title="Customise proof position"
      />
    </div>
  </div>
)

// ─── Per-line "Customer Notes shown on proof" editor ─────────────────────────

type LineProofNotesEditorProps = {
  orderId: string
  lineItemId: string
  /** Customer's original order-time notes — the default seed + reset target. */
  originalNotes: string | null
  /** Saved staff override for this line, or undefined when none (use original).
   *  An empty string IS a valid override (means "show no notes box"). */
  savedOverride: string | undefined
  /** True when this line has any per-side print-dimension override set. */
  hasDimensions: boolean
  onSaved: (lineItemId: string, value: string) => void
  onReset: (lineItemId: string) => void
}

const LineProofNotesEditor = ({
  orderId,
  lineItemId,
  originalNotes,
  savedOverride,
  hasDimensions,
  onSaved,
  onReset,
}: LineProofNotesEditorProps) => {
  const hasOverride = savedOverride !== undefined
  const effective = hasOverride ? (savedOverride as string) : originalNotes ?? ""
  const [draft, setDraft] = useState<string>(effective)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-sync the draft when the persisted value changes (after save/reset/reload).
  useEffect(() => {
    setDraft(hasOverride ? (savedOverride as string) : originalNotes ?? "")
  }, [savedOverride, originalNotes, hasOverride])

  const dirty = draft !== effective

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(adminProofNotesPath(orderId), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ line_item_id: lineItemId, notes: draft }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      onSaved(lineItemId, draft.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }, [draft, orderId, lineItemId, onSaved])

  const handleReset = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(
        `${adminProofNotesPath(orderId)}?line_item_id=${encodeURIComponent(lineItemId)}`,
        { method: "DELETE", credentials: "include", headers: { Accept: "application/json" } }
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      onReset(lineItemId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed")
    } finally {
      setSaving(false)
    }
  }, [orderId, lineItemId, onReset])

  const showContradiction = hasDimensions && looksLikeSize(draft)
  const originalTrimmed = (originalNotes ?? "").trim()

  return (
    <div className="mt-3 rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-2">
      <Text size="xsmall" weight="plus">
        Customer Notes (shown on proof PDF)
      </Text>
      <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
        Seeded from what the customer typed at checkout. Edit what the proof shows — clear it to
        show no notes, or reset to the customer&apos;s original.
      </Text>

      {showContradiction ? (
        <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1.5">
          <Text size="xsmall" className="text-orange-800">
            ⚠ These notes mention a size and this line has print-dimension fields set. Check the
            note doesn&apos;t contradict the dimensions shown under each garment.
          </Text>
        </div>
      ) : null}

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Notes shown on the proof (e.g. placement, colour match). Leave blank for none."
        className="mt-2"
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button size="small" variant="secondary" disabled={saving || !dirty} onClick={handleSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {hasOverride ? (
          <Button size="small" variant="transparent" disabled={saving} onClick={handleReset}>
            Reset to customer&apos;s original
          </Button>
        ) : null}
        {saved ? <Text size="xsmall" className="text-ui-fg-subtle">Saved ✓</Text> : null}
        {error ? <Text size="xsmall" className="text-ui-fg-error">{error}</Text> : null}
      </div>

      {hasOverride && originalTrimmed && originalTrimmed !== (savedOverride as string).trim() ? (
        <Text size="xsmall" className="text-ui-fg-muted mt-2 whitespace-pre-wrap">
          Customer&apos;s original: {originalTrimmed}
        </Text>
      ) : null}
    </div>
  )
}

// ─── Main widget ─────────────────────────────────────────────────────────────

const OrderCustomizerDownloadsWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const orderId = data?.id

  // Build naming context from the order object
  const displayId = String((data as any)?.display_id ?? orderId ?? "order")
  const customerSlug = (() => {
    const order = data as any
    const firstName = order?.customer?.first_name ?? order?.billing_address?.first_name ?? ""
    const lastName = order?.customer?.last_name ?? order?.billing_address?.last_name ?? ""
    const full = `${firstName}${lastName}`
    return slugify(full) || slugify(order?.email ?? "") || "customer"
  })()
  const [payload, setPayload] = useState<DownloadPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(true)

  // All proofs for this order — grouped per side when rendering
  const [allProofs, setAllProofs] = useState<RevisedProof[]>(() => {
    const meta = (data?.metadata ?? {}) as Record<string, unknown>
    return Array.isArray(meta.revised_proofs) ? (meta.revised_proofs as RevisedProof[]) : []
  })

  // Per-side studio notes, keyed `${lineItemId}:${side}` — shown under each
  // mockup on the customer approval page.
  const [studioNotes, setStudioNotes] = useState<Record<string, string>>(() => {
    const meta = (data?.metadata ?? {}) as Record<string, unknown>
    const raw = meta.mockup_studio_notes
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, string>)
      : {}
  })

  // Per-side print-dimension overrides, keyed `${lineItemId}:${side}` — shown
  // under each mockup on the proof PDF and the customer approval page.
  const [printDimensions, setPrintDimensions] = useState<Record<string, string>>(() => {
    const meta = (data?.metadata ?? {}) as Record<string, unknown>
    const raw = meta.mockup_print_dimensions
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, string>)
      : {}
  })

  // Per-line Customer Notes overrides, keyed by line_item_id. Empty string is a
  // valid value ("show no notes box"), so absence (not emptiness) means "use the
  // customer's original" — keep this map's empty strings intact.
  const [proofNotes, setProofNotes] = useState<Record<string, string>>(() => {
    const meta = (data?.metadata ?? {}) as Record<string, unknown>
    const raw = meta.mockup_proof_notes
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, string>)
      : {}
  })

  // Storefront base URL + country code for building the customiser iframe URL
  const [storefrontUrl, setStorefrontUrl] = useState<string | null>(null)
  const [countryCode, setCountryCode] = useState<string>("au")

  // Modal state — null = closed, string = customiser iframe src
  const [modalSrc, setModalSrc] = useState<string | null>(null)

  // Fetch scp-config once
  useEffect(() => {
    fetch("/admin/scp-config", { credentials: "include", headers: { Accept: "application/json" } })
      .then((r) => r.ok ? r.json() : null)
      .then((body) => {
        if (body?.storefront_url) {
          setStorefrontUrl(String(body.storefront_url).replace(/\/$/, ""))
          setCountryCode(String(body.country_code ?? "au"))
        }
      })
      .catch(() => { /* non-critical */ })
  }, [])

  // postMessage listener — receives proof-save events from the iframe
  useEffect(() => {
    if (!orderId) return
    const handler = async (event: MessageEvent) => {
      if (!event.data || event.data.type !== "ADMIN_PROOF_SAVED") return
      const { mockupUrl, artworkUrl, lineItemId, side } = event.data as {
        mockupUrl: string
        artworkUrl?: string | null
        lineItemId: string
        side: string
      }
      if (!mockupUrl || !lineItemId || !side) return

      // Save the proof via URL-only path
      try {
        const res = await fetch(adminProofPath(orderId), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            line_item_id: lineItemId,
            side,
            mockup_url: mockupUrl,
            artwork_url: artworkUrl ?? undefined,
          }),
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok) {
          setAllProofs(body.proofs ?? [])
        }
      } catch { /* handled silently — user can verify the result */ }

      setModalSrc(null)
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [orderId])

  const downloadMockupPdf = useCallback(async () => {
    if (!orderId) return
    setPdfLoading(true)
    setPdfError(null)
    try {
      const res = await fetch(`/admin/orders/${orderId}/mockup-pdf`, {
        credentials: "include",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(body?.message || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `artwork-approval-${data?.display_id ?? orderId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "Failed to generate PDF")
    } finally {
      setPdfLoading(false)
    }
  }, [orderId, data?.display_id])

  const load = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setError(null)
    try {
      const [artifactsRes, proofsRes, notesRes, dimensionsRes, proofNotesRes] = await Promise.all([
        fetch(adminCustomizerDownloadPath(orderId), {
          credentials: "include",
          headers: { Accept: "application/json" },
        }),
        fetch(adminProofPath(orderId), {
          credentials: "include",
          headers: { Accept: "application/json" },
        }),
        fetch(adminMockupNotePath(orderId), {
          credentials: "include",
          headers: { Accept: "application/json" },
        }),
        fetch(adminPrintDimensionPath(orderId), {
          credentials: "include",
          headers: { Accept: "application/json" },
        }),
        fetch(adminProofNotesPath(orderId), {
          credentials: "include",
          headers: { Accept: "application/json" },
        }),
      ])
      const artifactsBody = (await artifactsRes.json().catch(() => ({}))) as DownloadPayload & { message?: string }
      if (!artifactsRes.ok) throw new Error(artifactsBody?.message || `HTTP ${artifactsRes.status}`)
      setPayload(artifactsBody)

      if (proofsRes.ok) {
        const proofsBody = await proofsRes.json().catch(() => ({})) as { proofs?: RevisedProof[] }
        setAllProofs(proofsBody.proofs ?? [])
      }

      if (notesRes.ok) {
        const notesBody = await notesRes.json().catch(() => ({})) as { notes?: Record<string, string> }
        setStudioNotes(notesBody.notes ?? {})
      }

      if (dimensionsRes.ok) {
        const dimensionsBody = await dimensionsRes.json().catch(() => ({})) as { dimensions?: Record<string, string> }
        setPrintDimensions(dimensionsBody.dimensions ?? {})
      }

      if (proofNotesRes.ok) {
        const proofNotesBody = await proofNotesRes.json().catch(() => ({})) as { notes?: Record<string, string> }
        setProofNotes(proofNotesBody.notes ?? {})
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customizer assets")
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  const lines = payload?.lines?.filter((line) => line.has_customizer) ?? []

  if (!orderId) return null

  const handleProofsChange = useCallback((updated: RevisedProof[]) => {
    setAllProofs(updated)
  }, [])

  const buildCustomiserSrc = (
    line: LinePayload,
    art: ArtifactPayload,
    artworkUrl: string | null
  ): string | null => {
    if (!storefrontUrl || !line.product_handle || !line.variant_id) return null
    const base = `${storefrontUrl}/${countryCode}/customizer`
    const params: Record<string, string> = {
      // The customizer page resolves the garment from `handle` (same param the
      // reorder / saved-design / product-picker flows use). Passing `product`
      // here was a silent bug — the page ignored it and fell back to the first
      // shirt-like product in the catalog, so the proof opened on the wrong
      // garment (and the wrong-colour, since `variant` couldn't match it).
      handle: line.product_handle,
      variant: line.variant_id,
      adminProof: `${orderId}:${line.line_item_id}:${art.side}`,
    }
    if (artworkUrl) params.proofArtwork = encodeURIComponent(artworkUrl)
    return `${base}?${new URLSearchParams(params).toString()}`
  }

  return (
    <>
      {/* Fullscreen customiser modal */}
      {modalSrc ? (
        <CustomiserModal src={modalSrc} onClose={() => setModalSrc(null)} />
      ) : null}

      <Container className="divide-y p-0 border-t border-ui-border-base">
        <div className="flex items-center justify-between px-6 py-4">
          <button
            type="button"
            className="flex items-center gap-2 text-left"
            onClick={() => setCollapsed((c) => !c)}
          >
            <ChevronDown
              className={`text-ui-fg-subtle transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
            />
            <div>
              <Heading level="h2" className="flex items-center">
                Customizer print & preview
                <HelpTooltip
                  text={{
                    title: "Customizer print & preview",
                    body: "Customer's original uploaded file, the rendered high-res print PNG, and the garment mockup JPEG for each decorated side. Upload a revised proof per location to replace the mockup in the customer's approval email.",
                    bullets: [
                      "Left column: artwork (customer upload or proof artwork).",
                      "Right column: garment mockup — swaps to show revised version from the history dropdown.",
                      "Upload a revised proof under any side to replace that mockup in the next approval email.",
                      "Use 'Customise position' to reposition artwork on the garment via the design tool.",
                    ],
                  }}
                />
              </Heading>
              <Text size="small" className="text-ui-fg-subtle mt-1">
                Customer uploads, print PNGs, mockups, and per-location proof history.
              </Text>
            </div>
          </button>
          <div className="flex flex-col items-end gap-y-1">
            <Button
              variant="secondary"
              size="small"
              onClick={downloadMockupPdf}
              disabled={pdfLoading}
            >
              {pdfLoading ? "Generating…" : "Download Mockup PDF"}
            </Button>
            {pdfError ? (
              <Text size="xsmall" className="text-ui-fg-error">
                {pdfError}
              </Text>
            ) : null}
          </div>
        </div>

        {!collapsed && (
          <div className="px-6 py-4">
            {error ? (
              <Text size="small" className="text-ui-fg-error">{error}</Text>
            ) : loading && !payload ? (
              <Text size="small" className="text-ui-fg-subtle">Loading downloadable assets…</Text>
            ) : lines.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No custom-designed items on this order — nothing to download here.
              </Text>
            ) : (
              <ul className="flex flex-col gap-y-5 list-none p-0 m-0">
                {lines.map((line) => (
                  <li
                    key={line.line_item_id}
                    className="border-b border-ui-border-base pb-4 last:border-0 last:pb-0"
                  >
                    <Text size="small" weight="plus" className="text-ui-fg-base">
                      {lineHeading(line)}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
                      Qty {line.quantity}
                    </Text>

                    {line.customer_original_files && line.customer_original_files.length > 0 ? (
                      <div className="mt-3 rounded-md border border-ui-border-base bg-ui-bg-component px-3 py-2">
                        <Text size="xsmall" weight="plus">
                          Customer upload (original file — unchanged)
                        </Text>
                        <ul className="mt-2 list-none m-0 p-0 flex flex-col gap-y-2">
                          {line.customer_original_files.map((f, idx) => {
                            const gc = garmentCodeFromHandle(line.product_handle)
                            const ext = f.mime_type === "image/svg+xml" ? "svg"
                              : f.mime_type === "image/jpeg" ? "jpg" : "png"
                            const suffix = line.customer_original_files!.length > 1
                              ? `original-${idx + 1}`
                              : "original"
                            const dlName = buildFileName({
                              displayId,
                              customerSlug,
                              side: gc,
                              garmentCode: suffix,
                              ext,
                            })
                            return (
                              <li key={f.url}>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-xsmall text-ui-fg-muted">{f.mime_type}</span>
                                  <span className="text-xsmall text-ui-fg-subtle truncate max-w-[200px]" title={f.file_name}>
                                    {f.file_name}
                                  </span>
                                </div>
                                <DownloadLink
                                  href={f.url}
                                  fileName={dlName}
                                  label="Download original"
                                />
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ) : null}

                    {line.artifacts.length === 0 ? (
                      <Text size="xsmall" className="text-ui-fg-subtle mt-2">
                        This design has no print or mockup files yet. They usually appear within a
                        minute of the order being placed — refresh shortly, or re-save the design if
                        they don't show.
                      </Text>
                    ) : null}

                    <LineProofNotesEditor
                      orderId={orderId}
                      lineItemId={line.line_item_id}
                      originalNotes={line.print_notes ?? null}
                      savedOverride={
                        Object.prototype.hasOwnProperty.call(proofNotes, line.line_item_id)
                          ? proofNotes[line.line_item_id]
                          : undefined
                      }
                      hasDimensions={Object.keys(printDimensions).some((k) =>
                        k.startsWith(`${line.line_item_id}:`)
                      )}
                      onSaved={(id, value) =>
                        setProofNotes((prev) => ({ ...prev, [id]: value }))
                      }
                      onReset={(id) =>
                        setProofNotes((prev) => {
                          const next = { ...prev }
                          delete next[id]
                          return next
                        })
                      }
                    />

                    <ul className="mt-2 flex flex-col gap-y-3 list-none p-0">
                      {line.artifacts.map((art) => {
                        const key = sideKey(line.line_item_id, art.side)
                        const proofsForSide = allProofs.filter(
                          (p) => p.line_item_id === line.line_item_id && p.side === art.side
                        )
                        // The per-side artwork preview MUST be side-correct.
                        // Newer orders stamp `sides` on each original (which
                        // canvas side(s) reference that upload), so prefer the
                        // original attributed to THIS side. Older orders have
                        // no side info — there the mapping is only unambiguous
                        // with exactly ONE uploaded file and ONE decorated
                        // side. When ambiguous, leave null so SideProofCard
                        // falls back to this side's own rendered print PNG
                        // (`art.print_url`), which is always side-correct —
                        // the flat list above ("Customer upload") still links
                        // every original. Previously the single file was shown
                        // under EVERY side, which made staff read the BACK
                        // upload as the FRONT's artwork on multi-side orders.
                        const originalFiles = line.customer_original_files ?? []
                        const sideOriginals = originalFiles.filter((f) =>
                          f.sides?.includes(art.side)
                        )
                        const customerOriginalFileUrl =
                          sideOriginals.length === 1
                            ? sideOriginals[0].url
                            : originalFiles.length === 1 &&
                                line.artifacts.length === 1 &&
                                !originalFiles[0].sides
                              ? originalFiles[0].url
                              : null
                        const garmentCode = garmentCodeFromHandle(line.product_handle)

                        // Build customiser URL — requires storefront URL + product handle + variant ID
                        const makeCustomiserCb = (artworkUrl: string | null) => {
                          const src = buildCustomiserSrc(line, art, artworkUrl)
                          if (src) setModalSrc(src)
                        }
                        const canCustomise =
                          !!storefrontUrl &&
                          !!line.product_handle &&
                          !!line.variant_id

                        return (
                          <SideProofCard
                            key={key}
                            orderId={orderId}
                            lineItemId={line.line_item_id}
                            art={art}
                            proofsForSide={proofsForSide}
                            customerOriginalFileUrl={customerOriginalFileUrl}
                            onProofsChange={handleProofsChange}
                            onCustomisePosition={canCustomise ? makeCustomiserCb : null}
                            displayId={displayId}
                            customerSlug={customerSlug}
                            garmentCode={garmentCode}
                            studioNote={studioNotes[key] ?? ""}
                            onStudioNoteSaved={(note) =>
                              setStudioNotes((prev) => {
                                const next = { ...prev }
                                if (note) next[key] = note
                                else delete next[key]
                                return next
                              })
                            }
                            printDimension={printDimensions[key] ?? ""}
                            onPrintDimensionSaved={(dimension) =>
                              setPrintDimensions((prev) => {
                                const next = { ...prev }
                                if (dimension) next[key] = dimension
                                else delete next[key]
                                return next
                              })
                            }
                          />
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Container>
    </>
  )
}

export const config = defineWidgetConfig({
  /** Main column (full width) — above JSON debug; easy to scan without expanding metadata. */
  zone: "order.details.after",
})

export default withWidgetBoundary(OrderCustomizerDownloadsWidget, "order-customizer-downloads")
