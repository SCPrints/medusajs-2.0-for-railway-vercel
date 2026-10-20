import { z } from "zod"

/**
 * Delivery address a customer (accept page) or staff (Convert to order) give
 * when a quote becomes an order. Stored on `quote.metadata.delivery_address`
 * and used as the order's shipping address — before this, a guest quote
 * converted with the studio's own address as a placeholder (#114, 21 Oct).
 */
export const deliveryAddressSchema = z.object({
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  address_1: z.string().trim().min(1).max(200),
  address_2: z.string().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  province: z.string().trim().max(50).optional(),
  postal_code: z.string().trim().min(3).max(12),
  country_code: z.string().length(2).optional(),
  phone: z.string().max(40).optional(),
})

export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>

const clean = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s : undefined
}

/** Trims every field, lower-cases the country (default au), drops empties. */
export function normaliseDeliveryAddress(input: DeliveryAddress): DeliveryAddress {
  return {
    first_name: clean(input.first_name),
    last_name: clean(input.last_name),
    company: clean(input.company),
    address_1: input.address_1.trim(),
    address_2: clean(input.address_2),
    city: input.city.trim(),
    province: clean(input.province)?.toUpperCase(),
    postal_code: input.postal_code.trim(),
    country_code: (clean(input.country_code) ?? "au").toLowerCase(),
    phone: clean(input.phone),
  }
}

/** A stored metadata value that still looks like a usable address. */
export function readStoredDeliveryAddress(value: unknown): DeliveryAddress | null {
  const parsed = deliveryAddressSchema.safeParse(value)
  return parsed.success ? normaliseDeliveryAddress(parsed.data) : null
}
