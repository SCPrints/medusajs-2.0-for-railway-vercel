import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { slugifyBrandHandle } from "../../lib/brand-handle"
import { archiveSideLayoutsIfLarge } from "../../lib/side-layouts-archive"
import { printSizeIdForDesign } from "../../lib/group-order-lines"
import { FUNDRAISING_MAX_PER_ITEM, designMockups, itemVariants } from "../../lib/team-store"
import { ORGANISATION_MODULE } from "../../modules/organisation"
import { TEAM_STORE_MODULE } from "../../modules/team-store"
import { loadProductsByHandle, productColours } from "./catalog"
import { hashStorePassword } from "./sign"
import { storeUrl } from "./run"

const dateish = z.union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)])

export const storeBodySchema = z.object({
  organisation_id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  handle: z.string().trim().max(120).optional(),
  intro: z.string().trim().max(4000).nullable().optional(),
  banner_url: z.string().url().max(2000).nullable().optional(),
  accent_colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  opens_at: dateish.nullable().optional(),
  closes_at: dateish,
  /** Plain text in, hash stored. "" clears it; omitted keeps it. */
  password: z.string().max(100).optional(),
  delivery_mode: z.enum(["bulk", "individual"]).default("bulk"),
  delivery_destination_id: z.string().nullable().optional(),
  expected_quantity: z.coerce.number().int().min(0).max(100000).default(0),
  minimum_quantity: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  /** Dollars inc GST added to every item for the club / school; 0 = none. */
  fundraising_per_item: z.coerce.number().min(0).max(FUNDRAISING_MAX_PER_ITEM).optional(),
})

/** Status moves staff make by hand; the rest have their own actions (send-approval, open, close). */
export const MANUAL_STATUSES = ["draft", "in_production", "completed", "cancelled"] as const

export const itemBodySchema = z.object({
  product_handle: z.string().trim().min(1).max(200),
  colour: z.string().trim().min(1).max(120),
  allowed_sizes: z.array(z.string().trim().min(1).max(20)).max(40).nullable().optional(),
  /** Pasted CustomizerMetadata (until the Studio has been used). */
  customizer_design: z.record(z.string(), z.unknown()).nullable().optional(),
  unit_price: z.coerce.number().min(0).max(10000).nullable().optional(),
  unit_cost_estimate: z.coerce.number().min(0).max(10000).nullable().optional(),
  weight: z.coerce.number().int().min(0).max(1000).optional(),
  is_active: z.boolean().optional(),
})

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    )
  }
  return parsed.data
}

/** Store row fields from a (partial) body. */
export async function storeFields(
  container: MedusaContainer,
  body: Partial<z.infer<typeof storeBodySchema>>,
  existingId?: string
): Promise<Record<string, unknown>> {
  const service = container.resolve(TEAM_STORE_MODULE) as any
  const out: Record<string, unknown> = {}
  for (const k of [
    "organisation_id",
    "title",
    "intro",
    "banner_url",
    "accent_colour",
    "delivery_mode",
    "delivery_destination_id",
    "expected_quantity",
    "minimum_quantity",
  ] as const) {
    if (body[k] !== undefined) out[k] = body[k]
  }
  if (body.opens_at !== undefined) out.opens_at = body.opens_at ? new Date(body.opens_at) : null
  if (body.closes_at !== undefined) out.closes_at = new Date(body.closes_at)
  if (body.password !== undefined) out.password_hash = body.password ? hashStorePassword(body.password) : null
  if (body.fundraising_per_item !== undefined) {
    // metadata is replaced on update: merge with what the store already holds.
    const current = existingId ? ((await service.retrieveTeamStore(existingId)).metadata ?? {}) : {}
    out.metadata = { ...current, fundraising_per_item: Math.round(body.fundraising_per_item * 100) / 100 }
  }

  if (body.handle !== undefined || (!existingId && body.title)) {
    const handle = slugifyBrandHandle(body.handle || body.title || "")
    if (!handle) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A handle is needed for the store link.")
    const [clash] = await service.listTeamStores({ handle }, { take: 1 })
    if (clash && clash.id !== existingId) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, `A team store already uses the link "${handle}".`)
    }
    out.handle = handle
  }

  const mode = (body.delivery_mode ?? (existingId ? (await service.retrieveTeamStore(existingId)).delivery_mode : "bulk")) as string
  const destId = body.delivery_destination_id !== undefined ? body.delivery_destination_id : undefined
  const orgId = body.organisation_id ?? (existingId ? (await service.retrieveTeamStore(existingId)).organisation_id : null)
  if (destId) {
    const orgs = container.resolve(ORGANISATION_MODULE) as any
    const dest = await orgs.retrieveOrganisationDestination(destId).catch(() => null)
    if (!dest || dest.organisation_id !== orgId) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "The delivery address must belong to the store's organisation.")
    }
  }
  if (mode === "bulk" && destId === null) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Bulk delivery needs the club's delivery address.")
  }
  return out
}

/** Item row fields; a pasted/Studio design is archived to R2 before it is stored. */
export async function itemFields(
  container: MedusaContainer,
  storeId: string,
  body: Partial<z.infer<typeof itemBodySchema>>
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const k of ["product_handle", "colour", "unit_price", "unit_cost_estimate", "weight", "is_active"] as const) {
    if (body[k] !== undefined) out[k] = body[k]
  }
  if (body.allowed_sizes !== undefined) out.allowed_sizes = body.allowed_sizes?.length ? { sizes: body.allowed_sizes } : null
  if (body.customizer_design !== undefined) {
    Object.assign(out, await designFields(container, storeId, body.customizer_design))
  }
  return out
}

export async function designFields(
  container: MedusaContainer,
  storeId: string,
  design: Record<string, unknown> | null
): Promise<{ customizer_design: Record<string, unknown> | null; print_size_ids: Record<string, string> | null }> {
  if (!design) return { customizer_design: null, print_size_ids: null }
  const archived = await archiveSideLayoutsIfLarge(container, design, `team-store-${storeId}`)
  const bySide = Object.fromEntries(
    (Array.isArray(design.prints) ? (design.prints as any[]) : [])
      .filter((p) => typeof p?.side === "string" && typeof p?.sizeId === "string")
      .map((p) => [p.side, p.sizeId])
  )
  return {
    customizer_design: archived,
    print_size_ids: Object.keys(bySide).length ? bySide : { default: printSizeIdForDesign(design) },
  }
}

/** Store + organisation + items with garment info, for the admin detail page. */
export async function adminStoreView(container: MedusaContainer, storeId: string) {
  const service = container.resolve(TEAM_STORE_MODULE) as any
  const orgs = container.resolve(ORGANISATION_MODULE) as any
  const store = await service.retrieveTeamStore(storeId)
  const [items, org, destinations] = await Promise.all([
    service.listTeamStoreItems({ team_store_id: storeId }, { take: 200, order: { weight: "ASC", created_at: "ASC" } }),
    orgs.retrieveOrganisation(store.organisation_id).catch(() => null),
    orgs.listOrganisationDestinations({ organisation_id: store.organisation_id, is_active: true }, { take: 100 }).catch(() => []),
  ])
  const products = await loadProductsByHandle(container, (items as any[]).map((i) => i.product_handle))
  const { password_hash, ...rest } = store
  return {
    store: { ...rest, has_password: !!password_hash, url: storeUrl(store.handle) },
    organisation: org ? { id: org.id, name: org.name, contact_email: org.contact_email ?? null } : null,
    destinations,
    items: (items as any[]).map((i) => {
      const p = products.get(i.product_handle)
      return {
        ...i,
        unit_price: i.unit_price == null ? null : Number(i.unit_price),
        unit_cost_estimate: i.unit_cost_estimate == null ? null : Number(i.unit_cost_estimate),
        mockups: designMockups(i.customizer_design),
        has_design: !!i.customizer_design,
        customizer_design: undefined,
        product: p
          ? {
              id: p.id,
              title: p.title,
              thumbnail: p.thumbnail,
              colours: productColours(p),
              sizes: itemVariants({ ...i, allowed_sizes: null }, p.variants).map((v) => v.size),
            }
          : null,
      }
    }),
  }
}
