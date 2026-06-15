"use client"

import { useRef, useState } from "react"

import { uploadContactAttachment } from "../../lib/upload-attachment"

const MAX_FILES = 3
const MAX_FILE_BYTES = 20 * 1024 * 1024
// Validated by extension (browsers report .ai/.eps/.psd inconsistently); the
// backend enforces the same allowlist.
const ACCEPTED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "tif",
  "tiff",
  "pdf",
  "ai",
  "eps",
  "ps",
  "psd",
  "zip",
]
const ACCEPT_ATTR =
  ".png,.jpg,.jpeg,.webp,.gif,.svg,.tif,.tiff,.pdf,.ai,.eps,.ps,.psd,.zip,image/*,application/pdf,application/postscript,application/zip"

type Attachment = {
  id: string
  name: string
  size: number
  status: "uploading" | "done" | "error"
  url?: string
  mimeType?: string
  bytes?: number
  error?: string
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ""
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export default function ContactForm() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const idRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const uploading = attachments.some((a) => a.status === "uploading")

  const startUpload = async (id: string, file: File) => {
    try {
      const result = await uploadContactAttachment(file)
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id
            ? result
              ? {
                  ...a,
                  status: "done",
                  url: result.url,
                  mimeType: result.mimeType,
                  bytes: result.bytes,
                }
              : { ...a, status: "error", error: "Upload failed — please try again." }
            : a
        )
      )
    } catch {
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: "error", error: "Upload failed — please try again." } : a
        )
      )
    }
  }

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return
    const slots = MAX_FILES - attachments.length
    if (slots <= 0) return

    const toAdd: Attachment[] = []
    const uploads: Array<{ id: string; file: File }> = []

    for (const file of Array.from(fileList)) {
      if (toAdd.length >= slots) break
      const id = `a${idRef.current++}`
      const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        toAdd.push({ id, name: file.name, size: file.size, status: "error", error: "Unsupported file type" })
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        toAdd.push({ id, name: file.name, size: file.size, status: "error", error: "File is larger than 20 MB" })
        continue
      }
      toAdd.push({ id, name: file.name, size: file.size, status: "uploading" })
      uploads.push({ id, file })
    }

    setAttachments((prev) => [...prev, ...toAdd])
    uploads.forEach(({ id, file }) => void startUpload(id, file))
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id))

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (uploading) {
      alert("Please wait for your attachments to finish uploading.")
      return
    }

    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const data = {
      first_name: formData.get("first-name"),
      last_name: formData.get("last-name"),
      email: formData.get("email"),
      subject: formData.get("subject"),
      message: formData.get("message"),
      attachments: attachments
        .filter((a) => a.status === "done" && a.url)
        .map((a) => ({ url: a.url, fileName: a.name, mimeType: a.mimeType, bytes: a.bytes })),
    }

    try {
      // Use same-origin API route to avoid browser CORS preflight issues.
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        setSuccess(true)
        setAttachments([])
      } else {
        const body = await response.json().catch(() => null)
        alert(
          body?.message ??
            "Message could not be sent right now. Please try again shortly."
        )
      }
    } catch (err) {
      console.error(err)
      alert("Failed to send message. Please try again shortly.")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-12 bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex justify-center mb-6">
          <svg
            className="w-16 h-16 text-gray-900"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Message Received!</h2>
        <p className="mt-2 text-gray-500">We'll be in touch shortly.</p>
        <button
          onClick={() => setSuccess(false)}
          className="mt-6 text-sm font-semibold text-gray-900 underline"
        >
          Send another message
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="first-name"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              First name
            </label>
            <input
              id="first-name"
              name="first-name"
              type="text"
              autoComplete="given-name"
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label
              htmlFor="last-name"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Last name
            </label>
            <input
              id="last-name"
              name="last-name"
              type="text"
              autoComplete="family-name"
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div>
          <label
            htmlFor="subject"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            type="text"
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div>
          <label
            htmlFor="message"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Message
          </label>
          <textarea
            id="message"
            name="message"
            rows={6}
            required
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Attachments{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>

          <label
            htmlFor="contact-attachments"
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              if (attachments.length < MAX_FILES) handleFiles(e.dataTransfer.files)
            }}
            className={`flex flex-col items-center justify-center gap-1 w-full rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
              attachments.length >= MAX_FILES
                ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
                : dragActive
                ? "cursor-pointer border-gray-900 bg-gray-50"
                : "cursor-pointer border-gray-300 hover:border-gray-900 hover:bg-gray-50"
            }`}
          >
            <svg
              className="w-6 h-6 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span className="text-sm font-medium text-gray-700">
              {attachments.length >= MAX_FILES
                ? `Maximum ${MAX_FILES} files`
                : "Click to upload or drag & drop"}
            </span>
            <span className="text-xs text-gray-400">
              Artwork, logos, PDFs — JPG, PNG, PDF, AI, EPS, PSD, ZIP · up to 20 MB each · max {MAX_FILES}
            </span>
            <input
              id="contact-attachments"
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              disabled={attachments.length >= MAX_FILES}
              onChange={(e) => handleFiles(e.target.files)}
              className="sr-only"
            />
          </label>

          {attachments.length > 0 && (
            <ul className="mt-3 space-y-2">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2"
                >
                  <span className="shrink-0">
                    {a.status === "uploading" ? (
                      <svg className="w-5 h-5 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    ) : a.status === "done" ? (
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-800">{a.name}</span>
                    <span className="block text-xs text-gray-400">
                      {a.status === "error"
                        ? a.error
                        : a.status === "uploading"
                        ? "Uploading…"
                        : formatBytes(a.bytes ?? a.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    aria-label={`Remove ${a.name}`}
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:text-gray-900"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || uploading}
          className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Sending..." : uploading ? "Uploading attachments..." : "Send message"}
        </button>
      </form>
    </div>
  )
}
