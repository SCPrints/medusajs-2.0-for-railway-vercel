import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { classifyDecorationPricing } from "../lib/decoration-pricing-class"

/**
 * Every new product (supplier imports, the nightly catalog sync, admin) gets
 * its decoration pricing class from its fabric, so polyester garments price
 * on Supacolour from day one. Never overwrites a class already set. Never throws.
 */
export default async function productCreatedPricingClass({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const products = container.resolve(Modules.PRODUCT) as any
    const p = await products.retrieveProduct(data.id, { relations: ["type"] })
    const meta = (p?.metadata ?? {}) as Record<string, unknown>
    if (meta.internal_service === true || (meta.decoration_pricing_class !== undefined && meta.decoration_pricing_class !== null)) return
    const { cls, reason } = classifyDecorationPricing({ title: p.title, material: p.material, description: p.description, type: p.type?.value })
    if (!cls) return
    // Spread: a bare metadata object replaces the whole jsonb column.
    await products.updateProducts(p.id, { metadata: { ...meta, decoration_pricing_class: cls } })
    logger.info(`pricing class: ${p.title} → ${cls} (${reason})`)
  } catch (err: any) {
    logger.warn(`pricing class for new product ${data?.id} failed: ${err?.message ?? err}`)
  }
}

export const config: SubscriberConfig = {
  event: "product.created",
}
