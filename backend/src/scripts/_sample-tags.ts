import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function sampleTags({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["handle", "title", "tags.value"],
    filters: { handle: { $like: "ramo-%" } },
    pagination: { take: 1000 },
  })
  const rows = (products ?? []) as Array<{ handle: string; title: string | null; tags?: Array<{ value: string }> }>
  // Tally tag values across all products
  const counts = new Map<string, number>()
  for (const p of rows) {
    for (const t of p.tags ?? []) {
      counts.set(t.value, (counts.get(t.value) ?? 0) + 1)
    }
  }
  logger.info("Tag value distribution across Ramo products:")
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  for (const [t, n] of sorted) {
    logger.info(`  ${n.toString().padStart(4)}  ${t}`)
  }
  // Sample 5 products with full tag list
  logger.info("Sample products:")
  for (const p of rows.slice(0, 5)) {
    const tags = (p.tags ?? []).map((t) => t.value).join(", ") || "(none)"
    logger.info(`  ${p.handle} — tags=[${tags}]`)
  }
}
