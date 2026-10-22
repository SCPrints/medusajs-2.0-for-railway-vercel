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
import { buildDspProofPdf } from "../../../../../services/dsp-pack/pdf"
import { STAFF_EMAIL_ACTOR_PREFIX } from "../../../../../services/jobs/build"

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

  const pdf = await proofPdf(pack)
  const artwork = pack.packs.flatMap((p) =>
    p.artwork.flatMap((a) => [
      ...(a.printUrl ? [`${a.position} — print file: ${a.printUrl}`] : []),
      ...a.originals.map((f) => `${a.position} — customer file (${f.name}): ${f.url}`),
    ])
  )
  const body = [
    "Hi DSP team,",
    "",
    parsed.data.message || `Please book the job below for SC Prints. The art proof is attached (one page per position).`,
    "",
    ...pack.packs.flatMap((p) => [p.printiqText, ""]),
    "--- ARTWORK ---",
    ...artwork,
    "",
    `Our PO: ${pack.po}. Reply to this email with your job number and proof.`,
  ].join("\n")
  const summary = pack.packs.map((p) => p.title).join("; ")

  await (req.scope.resolve(Modules.NOTIFICATION) as any).createNotifications({
    to: parsed.data.to,
    channel: "email",
    template: EmailTemplates.CUSTOMER_MESSAGE,
    data: {
      emailOptions: {
        subject: `SC Prints PO ${pack.po} — ${summary}`.slice(0, 190),
        replyTo: orderInboxAddress(pack.order_id) ?? SUPPORT_REPLY_TO_EMAIL,
      },
      message: { body, signature: "SC Prints\ninfo@scprints.com.au · scprints.com.au" },
    },
    attachments: [{ content: pdf.toString("base64"), filename: fileName(pack), content_type: "application/pdf" }],
  })

  // Record the send on the order (metadata replaces wholesale — spread it).
  const orders = req.scope.resolve(Modules.ORDER) as any
  const order = await orders.retrieveOrder(pack.order_id)
  const entry = { at: new Date().toISOString(), to: parsed.data.to, by: actor }
  await orders.updateOrders(pack.order_id, { metadata: { ...(order.metadata ?? {}), dsp_sent: [...pack.sent, entry] } })
  await (req.scope.resolve(ADMIN_WORKSPACE_MODULE) as any).createOrderComments({
    order_id: pack.order_id,
    body: `Sent to DSP (${parsed.data.to}): ${pack.packs.reduce((n, p) => n + p.pages.length, 0)}-page art proof + job details.`,
    created_by: `${STAFF_EMAIL_ACTOR_PREFIX}${actor ?? "staff"}`,
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
