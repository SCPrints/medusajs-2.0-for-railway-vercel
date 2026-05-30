import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { PRINT_PROFILE_MODULE } from "../../../../modules/print-profile"
import type PrintProfileModuleService from "../../../../modules/print-profile/service"
import {
  PRINT_METHODS,
  PRINT_SIZES,
  sanitizeAreas,
} from "../../../../lib/print-profile"

const paramsSchema = z.object({ id: z.string().min(1) })

const areaSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(80).optional(),
  methods: z.array(z.enum(PRINT_METHODS)).min(1),
  sizes: z.array(z.enum(PRINT_SIZES)).min(1),
  max_prints: z.coerce.number().int().min(1).max(20).optional(),
})

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  handle: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  position: z.coerce.number().int().min(0).optional(),
  areas: z.array(areaSchema).optional(),
})

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = paramsSchema.parse(req.params ?? {})
  const service =
    req.scope.resolve<PrintProfileModuleService>(PRINT_PROFILE_MODULE)
  const profile = await service.retrievePrintProfile(id).catch(() => null)
  if (!profile) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Print profile "${id}" not found.`)
  }
  res.json({ print_profile: profile })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = paramsSchema.parse(req.params ?? {})
  const body = updateSchema.parse(req.body ?? {})
  const service =
    req.scope.resolve<PrintProfileModuleService>(PRINT_PROFILE_MODULE)

  const existing = await service.retrievePrintProfile(id).catch(() => null)
  if (!existing) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Print profile "${id}" not found.`)
  }

  const patch: Record<string, unknown> = { id }
  if (body.name !== undefined) patch.name = body.name
  if (body.handle !== undefined) patch.handle = body.handle
  if (body.description !== undefined) patch.description = body.description
  if (body.position !== undefined) patch.position = body.position
  if (body.areas !== undefined) patch.areas = sanitizeAreas(body.areas)

  // Guard against a handle collision when renaming the handle.
  if (body.handle !== undefined && body.handle !== existing.handle) {
    const [clash] = await service.listAndCountPrintProfiles(
      { handle: body.handle },
      { take: 1 }
    )
    if (clash.length > 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `A print profile with handle "${body.handle}" already exists.`
      )
    }
  }

  await service.updatePrintProfiles(patch as any)
  const updated = await service.retrievePrintProfile(id)
  res.json({ print_profile: updated })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = paramsSchema.parse(req.params ?? {})
  const service =
    req.scope.resolve<PrintProfileModuleService>(PRINT_PROFILE_MODULE)

  const existing = await service.retrievePrintProfile(id).catch(() => null)
  if (!existing) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Print profile "${id}" not found.`)
  }
  if ((existing as { is_system?: boolean }).is_system) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "System profiles can't be deleted — edit it instead, or reassign products to another profile."
    )
  }

  await service.deletePrintProfiles(id)
  res.json({ id, object: "print_profile", deleted: true })
}
