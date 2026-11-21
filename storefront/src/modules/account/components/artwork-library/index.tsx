"use client"

import { useRef, useState, useTransition } from "react"
import { useParams, useRouter } from "next/navigation"

import {
  createArtwork,
  deleteArtwork,
  updateArtwork,
  type ArtworkItem,
} from "@lib/data/artwork"
import { phCapture } from "@lib/posthog"
import GarmentPicker from "@modules/account/components/garment-picker"
import ArtworkCheckBadge from "@modules/customizer/components/artwork-check-badge"
import { uploadCustomerOriginalUnchanged } from "@modules/customizer/lib/upload-customer-original"

type ShareableOrg = { id: string; name: string }

type Props = {
  artwork: ArtworkItem[]
  /** Orgs I can share into (owner/purchaser). Empty hides sharing. */
  organisations: ShareableOrg[]
}

type UploadRow = {
  key: string
  name: string
  status: "uploading" | "saving" | "done" | "error"
  error?: string
}

const ACCEPTED = ["image/png", "image/jpeg", "image/svg+xml"]
const MAX_BYTES = 25 * 1024 * 1024

// Checkerboard so white or transparent logos stay visible.
const CHECKER = {
  backgroundColor: "#fff",
  backgroundImage:
    "linear-gradient(45deg,#eceef0 25%,transparent 25%),linear-gradient(-45deg,#eceef0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eceef0 75%),linear-gradient(-45deg,transparent 75%,#eceef0 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
}

const BTN =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-60"

const stripExtension = (name: string) => name.replace(/\.[a-z0-9]+$/i, "") || "Artwork"

const ArtworkLibrary = ({ artwork, organisations }: Props) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploads, setUploads] = useState<UploadRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const refresh = () => startTransition(() => router.refresh())
  const patchUpload = (key: string, patch: Partial<UploadRow>) =>
    setUploads((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return
    setError(null)
    const rows = files.map((f, i) => ({
      file: f,
      row: { key: `${Date.now()}-${i}-${f.name}`, name: f.name, status: "uploading" as const },
    }))
    setUploads((prev) => [...rows.map((r) => r.row), ...prev])

    await Promise.all(
      rows.map(async ({ file, row }) => {
        if (!ACCEPTED.includes(file.type)) {
          return patchUpload(row.key, { status: "error", error: "Use a PNG, JPG or SVG file." })
        }
        if (file.size > MAX_BYTES) {
          return patchUpload(row.key, { status: "error", error: "That file is over 25 MB." })
        }
        const url = await uploadCustomerOriginalUnchanged(file)
        if (!url) {
          return patchUpload(row.key, { status: "error", error: "Upload failed. Try again." })
        }
        patchUpload(row.key, { status: "saving" })
        const res = await createArtwork({
          url,
          name: stripExtension(file.name),
          mime_type: file.type,
        })
        if (!res.ok) return patchUpload(row.key, { status: "error", error: res.error })
        patchUpload(row.key, { status: "done" })
        phCapture("artwork_uploaded", { mime_type: file.type })
      })
    )
    refresh()
  }

  const handleRename = async (item: ArtworkItem) => {
    const name = renameDraft.trim()
    setRenamingId(null)
    if (!name || name === item.name) return
    setBusyId(item.id)
    const res = await updateArtwork(item.id, { name })
    setBusyId(null)
    if (!res.ok) return setError(res.error)
    refresh()
  }

  const handleShare = async (item: ArtworkItem, orgId: string | null) => {
    setBusyId(item.id)
    const res = await updateArtwork(item.id, { organisation_id: orgId })
    setBusyId(null)
    if (!res.ok) return setError(res.error)
    phCapture("artwork_shared", { shared: Boolean(orgId) })
    refresh()
  }

  const handleDelete = async (item: ArtworkItem) => {
    if (!confirm(`Remove “${item.name}” from your artwork?`)) return
    setBusyId(item.id)
    const res = await deleteArtwork(item.id)
    setBusyId(null)
    if (!res.ok) return setError(res.error)
    refresh()
  }

  const activeUploads = uploads.filter((u) => u.status !== "done")

  return (
    <div className="flex flex-col gap-6">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload artwork: drop files here or press to browse"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void uploadFiles(Array.from(e.dataTransfer.files))
        }}
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ink",
          dragging
            ? "border-brand"
            : "border-ui-border-base bg-white hover:border-ink/40",
        ].join(" ")}
        data-testid="artwork-dropzone"
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-brand" aria-hidden>
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        <p className="text-base font-semibold text-ui-fg-base">
          {dragging ? "Drop to upload" : "Drop your logos here"}
        </p>
        <p className="text-sm text-ui-fg-subtle">
          or <span className="font-semibold text-ink underline underline-offset-2">browse</span> · PNG, JPG or SVG, up to 25 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            void uploadFiles(Array.from(e.target.files ?? []))
            e.target.value = ""
          }}
        />
      </div>

      {activeUploads.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-live="polite">
          {activeUploads.map((u) => (
            <li key={u.key} className="flex items-center justify-between gap-3 rounded-lg border border-ui-border-base bg-white px-3 py-2 text-sm">
              <span className="truncate">{u.name}</span>
              {u.status === "error" ? (
                <span className="shrink-0 text-xs text-red-600">{u.error}</span>
              ) : (
                <span className="flex shrink-0 items-center gap-2 text-xs text-ui-fg-subtle">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ui-bg-subtle">
                    <span
                      className={`block h-full rounded-full bg-brand transition-all ${
                        u.status === "uploading" ? "w-1/2 animate-pulse" : "w-5/6"
                      }`}
                    />
                  </span>
                  {u.status === "uploading" ? "Uploading…" : "Saving…"}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {artwork.length === 0 ? (
        <p className="text-center text-sm text-ui-fg-subtle">
          Nothing here yet. Logos from your orders show up automatically.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 tablet:grid-cols-3 large:grid-cols-4">
          {artwork.map((item) => {
            const isBusy = busyId === item.id
            const canEdit = item.can_edit !== false
            return (
              <li key={item.id} className="flex flex-col overflow-hidden rounded-xl border border-ui-border-base bg-white" data-testid="artwork-card">
                <div className="relative flex aspect-square items-center justify-center p-3" style={CHECKER}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbnail_url ?? item.url}
                    alt={item.name}
                    loading="lazy"
                    className="max-h-full max-w-full object-contain"
                  />
                  <span className="absolute left-2 top-2 flex flex-col items-start gap-1">
                    {item.source === "order" ? (
                      <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-ui-fg-base shadow-xs">
                        From order
                      </span>
                    ) : null}
                    {item.shared_from ? (
                      <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-ui-fg-base shadow-xs">
                        Shared by {item.shared_from.organisation_name}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="pt-2">
                  <ArtworkCheckBadge url={item.url} mimeType={item.mime_type} />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  {renamingId === item.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => handleRename(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleRename(item)
                        }
                        if (e.key === "Escape") setRenamingId(null)
                      }}
                      maxLength={120}
                      aria-label="Artwork name"
                      className="min-h-11 rounded-sm border border-ui-border-base px-2 text-base focus:outline-hidden focus:ring-2 focus:ring-ink"
                    />
                  ) : canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(item.id)
                        setRenameDraft(item.name)
                      }}
                      title="Rename"
                      className="min-h-11 truncate text-left text-sm font-semibold text-ui-fg-base hover:underline"
                    >
                      {item.name}
                    </button>
                  ) : (
                    <p className="truncate py-2 text-sm font-semibold text-ui-fg-base">{item.name}</p>
                  )}

                  {canEdit && organisations.length > 0 ? (
                    <select
                      aria-label="Share with"
                      value={item.organisation_id ?? ""}
                      disabled={isBusy}
                      onChange={(e) => handleShare(item, e.target.value || null)}
                      className="min-h-11 rounded-md border border-ui-border-base bg-white px-2 text-sm"
                    >
                      <option value="">Just me</option>
                      {organisations.map((o) => (
                        <option key={o.id} value={o.id}>
                          Share with {o.name}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <div className="mt-auto flex flex-col gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => setPickerFor(item.id)}
                      className={`${BTN} bg-ink text-white hover:opacity-90`}
                    >
                      Use on a garment
                    </button>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={isBusy}
                        className="min-h-11 text-xs text-ui-fg-subtle hover:text-red-600 disabled:opacity-60"
                      >
                        {isBusy ? "Working…" : "Remove"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <GarmentPicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        title="Which garment?"
        onPick={(p) => {
          const id = pickerFor
          setPickerFor(null)
          if (!id) return
          phCapture("artwork_use_on_garment", { product_handle: p.handle })
          router.push(`/${countryCode}/products/${p.handle}?artwork=${encodeURIComponent(id)}`)
        }}
      />
    </div>
  )
}

export default ArtworkLibrary
