import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
export default async function check({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  // Total products
  const { data: total } = await query.graph({
    entity: "product",
    fields: ["id"],
    pagination: { take: 1 },
  })
  // Sample handles
  const { data: sample } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    pagination: { take: 20 },
  })
  // Prefix counts
  const { data: all } = await query.graph({
    entity: "product",
    fields: ["handle"],
    pagination: { take: 5000 },
  })
  const counts: Record<string, number> = {}
  for (const p of (all ?? []) as Array<{ handle: string }>) {
    const prefix = (p.handle || "").split("-")[0] || "(empty)"
    counts[prefix] = (counts[prefix] || 0) + 1
  }
  logger.info(`Total products in local DB: ${(all ?? []).length}`)
  logger.info("Handle prefix counts:")
  for (const [p, n] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    logger.info(`  ${n.toString().padStart(5)}  ${p}-*`)
  }
  logger.info("Sample handles (first 20):")
  for (const p of (sample ?? []) as Array<{ handle: string }>) {
    logger.info(`  ${p.handle}`)
  }
}
