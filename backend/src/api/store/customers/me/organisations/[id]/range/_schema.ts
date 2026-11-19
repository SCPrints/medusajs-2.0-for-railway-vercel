import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

export const rangeItemsSchema = z
  .array(
    z.object({
      design_id: z.string().min(1).max(80),
      variant_id: z.string().min(1).max(80),
      quantity: z.coerce.number().int().min(1).max(999),
    })
  )
  .min(1)
  .max(300)

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}`
    )
  }
  return parsed.data
}
