/**
 * Seed the standard system print profiles (Short Sleeve Garment, Long Sleeve
 * Garment, Sleeveless, Cap / Headwear, Beanie, Bag / Tote, Puffer Jacket).
 *
 * Idempotent — create-only by default (existing handles are left untouched so
 * staff edits to a system profile survive a re-run). Set SEED_UPDATE_SYSTEM=1
 * to overwrite the seeded profiles' name/description/areas/position from code
 * (use after changing SYSTEM_PROFILES in src/lib/print-profile.ts).
 *
 * Local:  cd backend && npx medusa exec src/scripts/seed-print-profiles.ts
 * Fly.io: cd /app/.medusa/server && npx medusa exec src/scripts/seed-print-profiles.js
 */

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { PRINT_PROFILE_MODULE } from "../modules/print-profile"
import type PrintProfileModuleService from "../modules/print-profile/service"
import { SYSTEM_PROFILES } from "../lib/print-profile"

export default async function seedPrintProfiles({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service =
    container.resolve<PrintProfileModuleService>(PRINT_PROFILE_MODULE)

  const updateSystem =
    process.env.SEED_UPDATE_SYSTEM === "1" ||
    process.env.SEED_UPDATE_SYSTEM === "true"

  const [existing] = await service.listAndCountPrintProfiles({}, { take: 1000 })
  const byHandle = new Map<string, { id: string }>(
    existing.map((p: any) => [p.handle, p])
  )

  let created = 0
  let updated = 0
  let skipped = 0

  for (const profile of SYSTEM_PROFILES) {
    const found = byHandle.get(profile.handle)
    if (!found) {
      await service.createPrintProfiles([
        {
          name: profile.name,
          handle: profile.handle,
          description: profile.description ?? null,
          is_system: true,
          position: profile.position ?? 0,
          areas: profile.areas as any,
        },
      ])
      created++
      logger.info(`  + created "${profile.name}" (${profile.handle})`)
      continue
    }
    if (updateSystem) {
      await service.updatePrintProfiles({
        id: found.id,
        name: profile.name,
        description: profile.description ?? null,
        is_system: true,
        position: profile.position ?? 0,
        areas: profile.areas as any,
      })
      updated++
      logger.info(`  ~ updated "${profile.name}" (${profile.handle})`)
    } else {
      skipped++
    }
  }

  logger.info(
    `Print profiles seeded — created ${created}, updated ${updated}, skipped ${skipped} (already present).`
  )
}
