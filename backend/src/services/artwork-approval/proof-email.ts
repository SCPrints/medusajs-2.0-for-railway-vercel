import { Modules } from "@medusajs/framework/utils"
import type { INotificationModuleService, MedusaContainer } from "@medusajs/framework/types"

import { SUPPORT_REPLY_TO_EMAIL } from "../../lib/constants"
import { tagUrl } from "../../lib/email-utm"
import {
  buildLineCustomizerExport,
  lineMockupGroupKey,
} from "../../lib/customizer-order-artifacts"
import { EmailTemplates } from "../../modules/email-notifications/templates"
import { signArtworkApproval } from "./sign"

const STOREFRONT_URL = process.env.STOREFRONT_URL?.replace(/\/$/, "")
const STOREFRONT_DEFAULT_COUNTRY_CODE =
  process.env.STOREFRONT_DEFAULT_COUNTRY_CODE?.toLowerCase()

const storefrontPrefix = () =>
  STOREFRONT_DEFAULT_COUNTRY_CODE ? `/${STOREFRONT_DEFAULT_COUNTRY_CODE}` : ""

export function buildPortalUrl(orderId: string): string | null {
  if (!STOREFRONT_URL) return null
  return `${STOREFRONT_URL}${storefrontPrefix()}/account/orders/details/${orderId}`
}

export function buildApprovalUrl(orderId: string): string | null {
  if (!STOREFRONT_URL) return null
  const sig = signArtworkApproval(orderId)
  return `${STOREFRONT_URL}${storefrontPrefix()}/artwork-approval/${encodeURIComponent(orderId)}?sig=${sig}`
}

type ProofImages = {
  mockupImages: { url: string; side: string; sideLabel: string | null }[] | null
  proofImageUrl: string | null
}

/**
 * Mockups for the proof email: one per (design group, colourway, side), with
 * the latest per-side revised proof swapped in. Needs `order.items`.
 */
export function buildProofImages(order: any): ProofImages {
  const meta = (order.metadata ?? {}) as Record<string, unknown>
  const revisedProofs = Array.isArray(meta.revised_proofs)
    ? (meta.revised_proofs as Array<{
        line_item_id?: string
        side?: string
        url?: string
        uploaded_at?: string
      }>)
    : []
  const photos = Array.isArray(meta.production_photos)
    ? (meta.production_photos as Array<{ url?: string; uploaded_at?: string }>)
    : []
  const newestFirst = (a: { uploaded_at?: string }, b: { uploaded_at?: string }) =>
    (a.uploaded_at ?? "") < (b.uploaded_at ?? "") ? 1 : -1
  const latestPhotoUrl =
    photos.filter((p) => typeof p?.url === "string" && p.url.length > 0).sort(newestFirst)[0]
      ?.url ?? null

  // Backward compat: proofs without line_item_id (old format) replace every
  // image via the single proofImageUrl path.
  const hasPerSideProofs = revisedProofs.some((p) => p.line_item_id)

  // The same design ordered across N size lines repeats identical mockups
  // otherwise (a 24-image email for one front + one back).
  const groupKeyOfLine = new Map<string, string>()
  for (const line of order.items ?? []) {
    groupKeyOfLine.set(line.id as string, lineMockupGroupKey(line))
  }
  const seen = new Set<string>()
  const rawArtifacts = (order.items ?? []).flatMap((line: any) => {
    const exp = buildLineCustomizerExport(line)
    return (exp?.artifacts ?? [])
      .filter((a: any) => a.mockup_url && !a.mockup_url_inline_omitted)
      .map((a: any) => ({
        groupKey: groupKeyOfLine.get(line.id) as string,
        url: a.mockup_url as string,
        side: a.side as string,
        sideLabel: (a.side_label ?? null) as string | null,
      }))
      .filter((a: any) => {
        const k = `${a.groupKey}:${a.side}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
  }) as { groupKey: string; url: string; side: string; sideLabel: string | null }[]

  let mockupImages: ProofImages["mockupImages"] = null
  if (rawArtifacts.length > 0) {
    const latestBySideKey = new Map<string, string>()
    if (hasPerSideProofs) {
      // A proof uploaded against ANY line in the group applies to the kept image.
      ;[...revisedProofs]
        .filter((p) => p.line_item_id && p.side && p.url)
        .sort(newestFirst)
        .forEach((p) => {
          const gk = groupKeyOfLine.get(p.line_item_id!) ?? p.line_item_id!
          const k = `${gk}:${p.side}`
          if (!latestBySideKey.has(k)) latestBySideKey.set(k, p.url!)
        })
    }
    mockupImages = rawArtifacts.map((a) => ({
      url: latestBySideKey.get(`${a.groupKey}:${a.side}`) ?? a.url,
      side: a.side,
      sideLabel: a.sideLabel,
    }))
  }

  const latestRevisedProofUrl = !hasPerSideProofs
    ? revisedProofs.filter((p) => typeof p?.url === "string" && p.url.length > 0).sort(newestFirst)[0]
        ?.url ?? null
    : null

  return {
    mockupImages,
    proofImageUrl: latestRevisedProofUrl ?? (mockupImages ? null : latestPhotoUrl),
  }
}

/**
 * Sends the artwork-approval email (signed one-click approve link + mockups).
 * Returns false when no approval link can be built (STOREFRONT_URL unset or
 * signing failed) so the caller can fall back. `order` needs `items` and
 * `shipping_address`.
 */
export async function sendProofEmail(
  container: MedusaContainer,
  order: any,
  options: { idempotencyKey: string; reminder?: boolean }
): Promise<boolean> {
  let approvalUrl: string | null = null
  try {
    approvalUrl = buildApprovalUrl(order.id)
  } catch {
    approvalUrl = null
  }
  if (!approvalUrl || !order.email) return false

  const displayId = order.display_id ?? order.id
  const { mockupImages, proofImageUrl } = buildProofImages(order)
  const notificationModuleService: INotificationModuleService = container.resolve(
    Modules.NOTIFICATION
  )
  await notificationModuleService.createNotifications({
    to: order.email,
    channel: "email",
    template: EmailTemplates.ARTWORK_APPROVAL,
    idempotency_key: options.idempotencyKey,
    data: {
      emailOptions: {
        replyTo: SUPPORT_REPLY_TO_EMAIL,
        subject: options.reminder
          ? `Reminder: your artwork proof for order #${displayId} is waiting`
          : `Your artwork proof for order #${displayId}`,
      },
      approval: {
        firstName: order.shipping_address?.first_name ?? null,
        orderDisplayId: displayId,
        approvalUrl:
          tagUrl(approvalUrl, {
            medium: "transactional",
            campaign: options.reminder ? "artwork_approval_reminder" : "artwork_approval",
            content: "approve_button",
          }) ?? approvalUrl,
        mockupImages,
        proofImageUrl,
        staffNote: options.reminder
          ? "Just a reminder: we can't start printing until you approve this proof or ask for changes."
          : null,
      },
      preview: options.reminder
        ? `Your proof for order #${displayId} is still waiting for sign-off.`
        : `Your proof is ready for sign-off — order #${displayId}.`,
    },
  })
  return true
}
