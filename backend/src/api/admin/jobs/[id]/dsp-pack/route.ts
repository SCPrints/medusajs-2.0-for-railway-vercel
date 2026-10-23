import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../lib/audit-log"
import { DSP_ORDER_EMAIL, SUPPORT_REPLY_TO_EMAIL } from "../../../../../lib/constants"
import { orderInboxAddress } from "../../../../../lib/order-inbox-alias"
import { ADMIN_WORKSPACE_MODULE } from "../../../../../modules/admin-workspace"
import { EmailTemplates } from "../../../../../modules/email-notifications/templates"
import { getDspPack, type DspPackResult } from "../../../../../services/dsp-pack/build"
import { artworkAtPrintSize, artworkPreview, buildDspProofPdf } from "../../../../../services/dsp-pack/pdf"

const fileName = (pack: DspPackResult) => `SCP-${pack.po}_${pack.customer}`.replace(/[^\w.-]+/g, "_").slice(0, 80) + "_DSP_proof.pdf"
const proofPdf = (pack: DspPackResult) => buildDspProofPdf(pack.packs, { po: pack.po, customer: pack.customer, dueDate: pack.due_date })

function fail(res: MedusaResponse, err: any) {
  if (err instanceof MedusaError && err.type === MedusaError.Types.NOT_FOUND) return res.status(404).json({ error: err.message })
  return res.status(500).json({ error: err?.message ?? "failed to build DSP pack" })
}

/**
 * GET /admin/jobs/:id/dsp-pack — the order's DSP job pack (lib/dsp-job.ts):
 * printIQ text, artwork links and warnings per garment group, plus the default
 * DSP address. `?format=pdf` returns the art proof stamped on DSP's template.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const pack = await getDspPack(req.scope, req.params.id)
    if (req.query.format !== "pdf") return res.json({ ...pack, default_to: DSP_ORDER_EMAIL ?? null })
    if (!pack.packs.length) return res.status(404).json({ error: "No screen print or Supacolour work on this order." })
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="${fileName(pack)}"`)
    return res.send(await proofPdf(pack))
  } catch (err: any) {
    return fail(res, err)
  }
}

const sendSchema = z.object({
  to: z.string().trim().email(),
  message: z.string().trim().max(4000).optional(),
})

/**
 * POST /admin/jobs/:id/dsp-pack { to, message? } — emails DSP the job: the
 * printIQ details + artwork links in the body, the art proof PDF attached.
 * Reply-To is the order's inbox alias, so DSP's answer lands on the job.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = sendSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: "Enter DSP's email address." })
  const actor = (req as any).auth_context?.actor_id ?? null

  let pack: DspPackResult
  try {
    pack = await getDspPack(req.scope, req.params.id)
  } catch (err: any) {
    return fail(res, err)
  }
  if (!pack.packs.length) return res.status(400).json({ error: "No screen print or Supacolour work on this order." })

  // Attach the proof and the artwork files themselves (no links to chase).
  const attachments: Array<{ content: string; filename: string; content_type: string }> = [
    { content: (await proofPdf(pack)).toString("base64"), filename: fileName(pack), content_type: "application/pdf" },
  ]
  // Resend refuses the whole email past 40 MB (base64 counted), so stop
  // attaching before that; skipped files are listed in the email instead.
  let budget = 35 * 1024 * 1024 - attachments[0].content.length
  const fits = (b64: string) => (b64.length <= budget ? ((budget -= b64.length), true) : false)
  const skipped: string[] = []
  const seen = new Set<string>()
  let previews = 0
  for (const pg of pack.packs.flatMap((p) => p.pages)) {
    // A staff print file is already in the proof as vector at print size — that page IS DSP's art file.
    if (pg.printFileUrl || !pg.artworkUrl || seen.has(pg.artworkUrl)) continue
    seen.add(pg.artworkUrl)
    try {
      const res = await fetch(pg.artworkUrl, { signal: AbortSignal.timeout(15_000) })
      const buf = Buffer.from(await res.arrayBuffer())
      if (!res.ok || buf.length > 15 * 1024 * 1024) continue // ponytail: >15 MB stays out; Resend caps the whole email at 40 MB
      const ext = (pg.artworkUrl.split("?")[0].split(".").pop() ?? "png").toLowerCase()
      const stem = `SCP-${pack.po}_${pg.positionLabel.replace(/\W+/g, "-")}`
      // Sized to print: an SVG opens at print size in Illustrator, a PNG measures the print width.
      const artwork = (await artworkAtPrintSize(buf, ext, pg.printSize)).toString("base64")
      if (!fits(artwork)) {
        skipped.push(`${pg.positionLabel}: ${pg.artworkUrl}`)
        continue
      }
      attachments.push({
        content: artwork,
        filename: `${stem}_artwork.${ext}`,
        content_type: res.headers.get("content-type") ?? "application/octet-stream",
      })
      const preview = pg.garmentHex ? await artworkPreview(buf, pg.garmentHex) : null
      const previewB64 = preview?.toString("base64")
      if (previewB64 && fits(previewB64)) {
        previews++
        attachments.push({ content: previewB64, filename: `${stem}_preview-on-garment.png`, content_type: "image/png" })
      }
    } catch {
      /* the proof still goes; the panel already warned about missing artwork */
    }
  }

  const artworkFiles = attachments.length - 1 - previews
  const vectorPages = pack.packs.reduce((n, p) => n + p.pages.filter((pg) => pg.printFileUrl).length, 0)
  const due = pack.due_date ? new Date(pack.due_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }) : null
  // A failed send must not be recorded as sent (no dsp_sent / comment / audit).
  const sendError = await (req.scope.resolve(Modules.NOTIFICATION) as any).createNotifications({
    to: parsed.data.to,
    channel: "email",
    template: EmailTemplates.DSP_JOB,
    data: {
      emailOptions: {
        subject: `New job — SC Prints PO ${pack.po} — ${pack.packs.map((p) => `${p.garment} x ${p.qty}`).join("; ")}`.slice(0, 190),
        replyTo: orderInboxAddress(pack.order_id) ?? SUPPORT_REPLY_TO_EMAIL,
      },
      po: pack.po,
      customer: pack.customer,
      due,
      note: parsed.data.message ?? null,
      garments: pack.packs.map((p) => ({
        garment: p.garment,
        sizes: p.sizesText,
        positions: p.pages.map((pg) => ({
          where: pg.positionLabel,
          what: pg.method === "screen" ? `Screen print, ${pg.screens} screens: ${pg.inks.join(", ")}` : "Supacolour transfer",
          size: pg.printSize ? `${pg.printSize.widthMm} × ${pg.printSize.heightMm} mm` : "Size from artwork",
        })),
      })),
      attachments: [
        `art proof (${pack.packs.reduce((n, p) => n + p.pages.length, 0)} pages${vectorPages ? `; ${vectorPages === 1 ? "1 position has" : `${vectorPages} positions have`} the print-ready vector artwork placed at print size` : ""})`,
        ...(artworkFiles ? [`${artworkFiles} artwork file${artworkFiles > 1 ? "s" : ""} at print size`] : []),
        ...(previews ? [`${previews} preview${previews > 1 ? "s" : ""} on the garment colour`] : []),
        ...skipped.map((s) => `too large to attach — download: ${s}`),
      ],
      pmsConfirm: pack.packs.some((p) => p.pages.some((pg) => pg.pmsFromArtwork)),
    },
    attachments,
  }).then(() => null, (err: any) => err)
  if (sendError) {
    return res.status(502).json({ error: `The email to DSP did not send: ${sendError?.message ?? "unknown error"}` })
  }

  // Record the send on the order (metadata replaces wholesale — spread it).
  const orders = req.scope.resolve(Modules.ORDER) as any
  const order = await orders.retrieveOrder(pack.order_id)
  const entry = { at: new Date().toISOString(), to: parsed.data.to, by: actor }
  await orders.updateOrders(pack.order_id, { metadata: { ...(order.metadata ?? {}), dsp_sent: [...pack.sent, entry] } })
  await (req.scope.resolve(ADMIN_WORKSPACE_MODULE) as any).createOrderComments({
    order_id: pack.order_id,
    body: `Sent to DSP (${parsed.data.to}): ${pack.packs.reduce((n, p) => n + p.pages.length, 0)}-page art proof + job details.`,
    // Plain actor, not the staff-email prefix: a supplier email doesn't answer
    // the customer, so it must not clear "waiting on us" (build.ts).
    created_by: actor ?? "staff",
  })
  await writeAudit({
    container: req.scope,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: pack.order_id,
    action: AUDIT_ACTION.EMAIL_SENT,
    actor_id: actor ?? undefined,
    details: { kind: "dsp_job_sent", to: parsed.data.to },
  })

  return res.json({ ok: true, sent: [...pack.sent, entry] })
}
