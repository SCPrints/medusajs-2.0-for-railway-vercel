import { z } from "zod"

/** Body of the admin supplier-document routes. */
export const supplierDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().max(2000).regex(/^https?:\/\//i, "Must be a web address"),
})
