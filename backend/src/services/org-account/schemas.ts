import { z } from "zod"

/** Shared by the store (owner) and admin (staff) routes. Money is AUD inc GST. */
const amount = z.coerce.number().positive().max(10_000_000)
const optionalDate = z
  .string()
  .max(40)
  .nullable()
  .optional()
  .refine((v) => v == null || v === "" || !Number.isNaN(new Date(v).getTime()), "Invalid date")

export const purchaseOrderCreateSchema = z.object({
  number: z.string().trim().min(1).max(60),
  amount,
  expires_at: optionalDate,
})

export const purchaseOrderUpdateSchema = z.object({
  number: z.string().trim().min(1).max(60).optional(),
  amount: amount.optional(),
  expires_at: optionalDate,
  is_active: z.boolean().optional(),
})

export const costCentreCreateSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
})

export const costCentreUpdateSchema = z.object({
  code: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  is_active: z.boolean().optional(),
})

/** "" / null clears a date; anything else becomes a Date. undefined = leave alone. */
export const toDate = (v: string | null | undefined): Date | null | undefined =>
  v === undefined ? undefined : v ? new Date(v) : null

/** First zod issue as a sentence a customer can read. */
export const zodMessage = (err: any): string =>
  err?.issues?.[0] ? `${err.issues[0].path?.join(".") || "Field"}: ${err.issues[0].message}` : "Invalid request."
