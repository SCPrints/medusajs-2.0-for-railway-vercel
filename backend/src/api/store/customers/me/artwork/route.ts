import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { CUSTOMER_ARTWORK_MODULE } from "../../../../../modules/customer-artwork"
import type CustomerArtworkModuleService from "../../../../../modules/customer-artwork/service"
import { MINIO_PUBLIC_URL } from "../../../../../lib/constants"
import { extractOrderOriginalFiles, extractProofArtwork, isOurPublicFileUrl } from "../../../../../lib/customer-artwork"
import {
  listCustomerOrgs,
  sharingFields,
  visibleToCustomerFilter,
  type CustomerOrg,
} from "../../../../../lib/customer-org-sharing"
import { requireCustomer } from "../../../../../lib/require-customer"

/** How many of the customer's newest orders the lazy import walks. */
const IMPORT_ORDER_LIMIT = 200
const LIST_LIMIT = 500

const ourUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => isOurPublicFileUrl(u, MINIO_PUBLIC_URL), {
    message: "File must be uploaded to SC Prints first.",
  })

const createBodySchema = z.object({
  url: ourUrl,
  name: z.string().trim().min(1).max(200),
  mime_type: z.string().trim().min(1).max(100),
  thumbnail_url: ourUrl.nullable().optional(),
})

function decorateArtwork(row: any, customerId: string, orgs: CustomerOrg[]) {
  return { ...row, ...sharingFields(row, customerId, orgs) }
}

/**
 * Copy every `customerOriginalFiles[]` entry on the customer's own order lines
 * into their library (source "order"). Idempotent: URLs already in the library
 * — including hidden ones, so a deleted logo stays deleted — are skipped, and
 * the (customer_id, url) unique index catches a concurrent import.
 * Raw SQL pulls only the originals fragment: line metadata can be multi-MB.
 */
async function importOrderArtwork(
  scope: MedusaContainer,
  service: CustomerArtworkModuleService,
  customerId: string
): Promise<void> {
  const pg = scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const result = await pg.raw(
    `select o.id as order_id,
            oi.metadata->'customizerDesign'->'customerOriginalFiles' as oi_originals,
            li.metadata->'customizerDesign'->'customerOriginalFiles' as li_originals
       from (select id, created_at from "order"
              where customer_id = ? and deleted_at is null
              order by created_at desc limit ?) o
       join order_item oi on oi.order_id = o.id and oi.deleted_at is null
       join order_line_item li on li.id = oi.item_id and li.deleted_at is null
      order by o.created_at desc`,
    [customerId, IMPORT_ORDER_LIMIT]
  )
  const rows: any[] = result?.rows ?? []
  // Plus the artwork staff approved in revised proofs: what was actually
  // printed, including jobs our team set up for the customer.
  const proofResult = await pg.raw(
    `select id as order_id, display_id, metadata->'revised_proofs' as proofs
       from "order"
      where customer_id = ? and deleted_at is null
        and jsonb_exists(metadata, 'revised_proofs')
      order by created_at desc limit ?`,
    [customerId, IMPORT_ORDER_LIMIT]
  )
  const seen = new Set<string>()
  const files = [
    ...extractProofArtwork(proofResult?.rows ?? []),
    ...extractOrderOriginalFiles(
      rows.flatMap((r) => [
        { order_id: r.order_id, originals: r.oi_originals },
        { order_id: r.order_id, originals: r.li_originals },
      ])
    ),
  ].filter((f) => {
    if (seen.has(f.url) || !isOurPublicFileUrl(f.url, MINIO_PUBLIC_URL)) return false
    seen.add(f.url)
    return true
  })
  if (files.length === 0) return

  const existing = (await service.listCustomerArtworks(
    { customer_id: customerId, url: files.map((f) => f.url) } as any,
    { select: ["url"], take: files.length }
  )) as Array<{ url: string }>
  const have = new Set(existing.map((r) => r.url))
  const missing = files
    .filter((f) => !have.has(f.url))
    .map((f) => ({
      customer_id: customerId,
      name: f.name,
      url: f.url,
      mime_type: f.mime_type,
      source: "order" as const,
      source_order_id: f.source_order_id,
    }))
  if (missing.length === 0) return

  try {
    await service.createCustomerArtworks(missing)
  } catch {
    // A concurrent request inserted some of these; add the rest one by one.
    for (const row of missing) {
      await service.createCustomerArtworks([row]).catch(() => undefined)
    }
  }
}

/**
 * GET /store/customers/me/artwork
 * → { artwork: ArtworkItem[] } — own rows + rows shared to my organisations,
 * hidden rows excluded, newest first.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const service = req.scope.resolve<CustomerArtworkModuleService>(CUSTOMER_ARTWORK_MODULE)

  try {
    await importOrderArtwork(req.scope, service, customerId)
  } catch (err) {
    // Never block the library on the import.
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[customer-artwork] order import failed for ${customerId}: ${(err as Error)?.message}`)
  }

  const orgs = await listCustomerOrgs(req.scope, customerId)
  const rows = (await service.listCustomerArtworks(
    { ...visibleToCustomerFilter(customerId, orgs), hidden_at: null } as any,
    { take: LIST_LIMIT, order: { created_at: "DESC" } }
  )) as any[]

  res.json({ artwork: rows.map((r) => decorateArtwork(r, customerId, orgs)) })
}

/**
 * POST /store/customers/me/artwork  { url, name, mime_type, thumbnail_url? }
 * → { artwork }. The file must already be on our storage (upload-original).
 * Re-adding a URL already in the library (even a hidden one) un-hides and
 * renames it instead of failing on the unique index.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const parsed = createBodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.issues.map((i) => i.message).join(", ")
    )
  }
  const body = parsed.data
  const service = req.scope.resolve<CustomerArtworkModuleService>(CUSTOMER_ARTWORK_MODULE)

  const [existing] = (await service.listCustomerArtworks(
    { customer_id: customerId, url: body.url } as any,
    { take: 1 }
  )) as any[]

  let row: any
  if (existing) {
    row = await service.updateCustomerArtworks({
      id: existing.id,
      name: body.name,
      mime_type: body.mime_type,
      hidden_at: null,
      ...(body.thumbnail_url !== undefined ? { thumbnail_url: body.thumbnail_url } : {}),
    } as any)
  } else {
    ;[row] = await service.createCustomerArtworks([
      {
        customer_id: customerId,
        name: body.name,
        url: body.url,
        mime_type: body.mime_type,
        thumbnail_url: body.thumbnail_url ?? null,
        source: "upload",
      },
    ])
  }

  const orgs = await listCustomerOrgs(req.scope, customerId)
  res.status(existing ? 200 : 201).json({ artwork: decorateArtwork(row, customerId, orgs) })
}
