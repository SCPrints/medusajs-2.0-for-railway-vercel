import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { PRINT_PROFILE_MODULE } from "../../../modules/print-profile"
import type PrintProfileModuleService from "../../../modules/print-profile/service"
import { slugifyBrandHandle } from "../../../lib/brand-handle"
import { PRINT_METHODS, PRINT_SIZES, sanitizeAreas } from "../../../lib/print-profile"

const areaSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(80).optional(),
  methods: z.array(z.enum(PRINT_METHODS)).min(1),
  sizes: z.array(z.enum(PRINT_SIZES)).min(1),
  max_prints: z.coerce.number().int().min(1).max(20).optional(),
})

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  handle: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  position: z.coerce.number().int().min(0).optional(),
  areas: z.array(areaSchema).default([]),
})

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service =
    req.scope.resolve<PrintProfileModuleService>(PRINT_PROFILE_MODULE)
  const [profiles] = await service.listAndCountPrintProfiles(
    {},
    { order: { position: "ASC", created_at: "ASC" } }
  )
  res.json({ print_profiles: profiles, count: profiles.length })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = bodySchema.parse(req.body ?? {})
  const service =
    req.scope.resolve<PrintProfileModuleService>(PRINT_PROFILE_MODULE)

  const handle = body.handle?.trim() || slugifyBrandHandle(body.name)
  if (!handle) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Profile handle could not be derived from name. Provide a handle explicitly."
    )
  }

  const [existing] = await service.listAndCountPrintProfiles({ handle }, { take: 1 })
  if (existing.length > 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `A print profile with handle "${handle}" already exists.`
    )
  }

  const [created] = await service.createPrintProfiles([
    {
      name: body.name,
      handle,
      description: body.description ?? null,
      is_system: false,
      position: body.position ?? 100,
      areas: sanitizeAreas(body.areas) as any,
    },
  ])

  res.status(201).json({ print_profile: created })
}
