import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { z } from "zod"

import { PRINT_PROFILE_MODULE } from "../../../../../modules/print-profile"
import type PrintProfileModuleService from "../../../../../modules/print-profile/service"
import {
  CUSTOM_PROFILE_HANDLE,
  PRINT_METHODS,
  PRINT_SIZES,
  sanitizeAreas,
  type PrintProfileArea,
} from "../../../../../lib/print-profile"
import {
  revalidateStorefrontTags,
  tagsForProduct,
} from "../../../../../lib/storefront-revalidate"
import { captureEvent } from "../../../../../lib/posthog"

const paramsSchema = z.object({ id: z.string().min(1) })

const areaSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(80).optional(),
  methods: z.array(z.enum(PRINT_METHODS)).min(1),
  sizes: z.array(z.enum(PRINT_SIZES)).min(1),
  max_prints: z.coerce.number().int().min(1).max(20).optional(),
})

const postSchema = z
  .object({
    /** Assign a stored profile by handle. Mutually exclusive with `areas`. */
    profile_handle: z.string().trim().min(1).nullable().optional(),
    /** Inline full-custom areas. When provided, profile_handle is forced to "custom". */
    areas: z.array(areaSchema).nullable().optional(),
  })
  .refine((b) => b.profile_handle !== undefined || b.areas !== undefined, {
    message: "Provide profile_handle or areas.",
  })

type ProductMeta = Record<string, unknown>

async function loadProduct(req: MedusaRequest, id: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata"],
    filters: { id },
  })
  return (data?.[0] ?? null) as
    | { id: string; handle: string | null; metadata: ProductMeta | null }
    | null
}

/** Resolve the areas the customizer will actually use for this product's metadata. */
function resolveAreas(
  meta: ProductMeta,
  profilesByHandle: Map<string, PrintProfileArea[]>
): { resolved: PrintProfileArea[] | null; handle: string | null; isCustom: boolean } {
  const handle =
    typeof meta.print_profile === "string" ? (meta.print_profile as string) : null
  const inline = sanitizeAreas(meta.print_config)
  if (handle === CUSTOM_PROFILE_HANDLE || (inline.length && !handle)) {
    return { resolved: inline.length ? inline : null, handle, isCustom: true }
  }
  if (handle && profilesByHandle.has(handle)) {
    return { resolved: profilesByHandle.get(handle) ?? null, handle, isCustom: false }
  }
  return { resolved: null, handle, isCustom: false }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = paramsSchema.parse(req.params ?? {})
  const product = await loadProduct(req, id)
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product "${id}" not found.`)
  }

  const service =
    req.scope.resolve<PrintProfileModuleService>(PRINT_PROFILE_MODULE)
  const [profiles] = await service.listAndCountPrintProfiles(
    {},
    { order: { position: "ASC", created_at: "ASC" } }
  )
  const byHandle = new Map<string, PrintProfileArea[]>(
    profiles.map((p) => [p.handle, (p.areas ?? []) as PrintProfileArea[]])
  )

  const meta = (product.metadata ?? {}) as ProductMeta
  const { resolved, handle, isCustom } = resolveAreas(meta, byHandle)

  res.json({
    product_id: product.id,
    profile_handle: handle,
    is_custom: isCustom,
    custom_areas: isCustom ? sanitizeAreas(meta.print_config) : [],
    resolved_areas: resolved,
    profiles: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      handle: p.handle,
      is_system: (p as { is_system?: boolean }).is_system ?? false,
      areas: p.areas ?? [],
    })),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = paramsSchema.parse(req.params ?? {})
  const body = postSchema.parse(req.body ?? {})

  const product = await loadProduct(req, id)
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product "${id}" not found.`)
  }

  const service =
    req.scope.resolve<PrintProfileModuleService>(PRINT_PROFILE_MODULE)
  const productModule = req.scope.resolve(Modules.PRODUCT) as {
    updateProducts: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }

  const meta: ProductMeta = { ...((product.metadata ?? {}) as ProductMeta) }

  if (body.areas !== undefined && body.areas !== null) {
    // Full-custom: store inline areas, mark the profile reference as "custom".
    const clean = sanitizeAreas(body.areas)
    if (!clean.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Custom config needs at least one valid area."
      )
    }
    meta.print_profile = CUSTOM_PROFILE_HANDLE
    meta.print_config = clean
  } else if (body.profile_handle) {
    // Assign a stored profile by handle — validate it exists.
    const [match] = await service.listAndCountPrintProfiles(
      { handle: body.profile_handle },
      { take: 1 }
    )
    if (!match.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `No print profile with handle "${body.profile_handle}".`
      )
    }
    meta.print_profile = body.profile_handle
    delete meta.print_config
  } else {
    // Explicit clear (profile_handle: null and no areas).
    delete meta.print_profile
    delete meta.print_config
  }

  await productModule.updateProducts(id, { metadata: meta })

  try {
    const actorId =
      (req as any).auth_context?.actor_id ?? (req as any).user?.id ?? "system"
    captureEvent(actorId, "product_print_profile_assigned", {
      product_id: id,
      profile_handle: typeof meta.print_profile === "string" ? meta.print_profile : null,
      is_custom: meta.print_profile === CUSTOM_PROFILE_HANDLE,
    })
  } catch {
    /* best-effort telemetry */
  }

  // Bust the storefront product cache so the customizer re-resolves immediately.
  await revalidateStorefrontTags(tagsForProduct(product.handle)).catch(() => {})

  res.json({
    product_id: id,
    profile_handle: typeof meta.print_profile === "string" ? meta.print_profile : null,
    is_custom: meta.print_profile === CUSTOM_PROFILE_HANDLE,
  })
}
