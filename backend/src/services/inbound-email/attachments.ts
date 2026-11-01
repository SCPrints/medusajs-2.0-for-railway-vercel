import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { MINIO_PUBLIC_URL } from "../../lib/constants"

/** What Resend's receiving attachments list returns per file. */
export type InboundAttachmentMeta = {
  filename?: string | null
  size: number
  content_type: string
  content_disposition?: string | null
  download_url: string
}

export type JobAttachment = { name: string; url: string }

const MAX_BYTES = 50 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 60_000
const BLOCK_MARKER = "\n\nAttachments:\n"
// ponytail: extension denylist, not a virus scan. The bucket is public, so
// don't host anything that runs on a click; zips still pass (artwork bundles).
const BLOCKED_EXT =
  /\.(exe|bat|cmd|com|scr|pif|msi|vbs|vbe|js|jse|wsf|wsh|ps1|jar|apk|app|dmg|pkg|sh|html?|hta|lnk|reg|dll|iso)$/i
// Apple Mail sends real artwork as "inline", so only small inline images count
// as signature logos. A stray logo on the job beats a lost file.
const SIGNATURE_IMAGE_MAX_BYTES = 30 * 1024

const safeName = (filename: string | null | undefined) =>
  (filename ?? "").replace(/[^\w.\- ]/g, "_").trim() || "attachment"

export function attachmentSkipReason(a: InboundAttachmentMeta): "signature" | "blocked type" | "too big" | null {
  if (a.content_disposition === "inline" && a.content_type.startsWith("image/") && a.size < SIGNATURE_IMAGE_MAX_BYTES) {
    return "signature"
  }
  if (BLOCKED_EXT.test(safeName(a.filename))) return "blocked type"
  if (a.size > MAX_BYTES) return "too big"
  return null
}

/** The lines added under the email's text: what was saved, and what wasn't. */
export function attachmentBlock(saved: JobAttachment[], notSaved: string[]): string {
  const missed = notSaved.length ? `\n\nNot saved: ${notSaved.join(", ")}` : ""
  const links = saved.length ? `${BLOCK_MARKER}${saved.map((f) => `- ${f.name}: ${f.url}`).join("\n")}` : ""
  return `${missed}${links}`
}

/**
 * Takes the links back out of a stored email for the diary. Only our own
 * bucket's URLs count, so a customer typing a look-alike block into their
 * email can't put a link on the job: it stays as plain text.
 */
export function splitAttachmentBlock(
  detail: string | null,
  publicUrl: string | undefined = MINIO_PUBLIC_URL
): { detail: string | null; attachments: JobAttachment[] } {
  const at = detail?.lastIndexOf(BLOCK_MARKER) ?? -1
  if (!detail || at < 0 || !publicUrl) return { detail, attachments: [] }
  const attachments: JobAttachment[] = []
  for (const line of detail.slice(at + BLOCK_MARKER.length).split("\n")) {
    const m = line.match(/^- (.+): (\S+)$/)
    if (!m || !m[2].startsWith(`${publicUrl}/`)) return { detail, attachments: [] }
    attachments.push({ name: m[1], url: m[2] })
  }
  return { detail: detail.slice(0, at), attachments }
}

/**
 * Copies an inbound email's attachments to our bucket (Resend's download links
 * expire) and returns the block to store with the email. A file that fails
 * twice is named in the block instead of holding up the customer's message.
 */
export async function storeInboundAttachments(
  container: MedusaContainer,
  attachments: InboundAttachmentMeta[]
): Promise<string> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const files = container.resolve(Modules.FILE) as any
  const saved: JobAttachment[] = []
  const notSaved: string[] = []

  for (const a of attachments) {
    const name = safeName(a.filename)
    const skip = attachmentSkipReason(a)
    if (skip === "signature") continue
    if (skip) {
      notSaved.push(`${name} (${skip})`)
      continue
    }
    let url: string | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < 2 && !url; attempt++) {
      try {
        const res = await fetch(a.download_url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
        if (!res.ok) throw new Error(`download ${res.status}`)
        const content = Buffer.from(await res.arrayBuffer())
        const [uploaded] = await files.createFiles([{ filename: name, mimeType: a.content_type, content }])
        url = uploaded?.url ?? null
      } catch (err) {
        lastError = err
      }
    }
    if (url) {
      saved.push({ name, url })
    } else {
      logger.warn(`inbound-email: attachment ${name} not saved: ${(lastError as Error)?.message ?? lastError}`)
      notSaved.push(`${name} (failed, ask the customer to resend)`)
    }
  }
  return attachmentBlock(saved, notSaved)
}
