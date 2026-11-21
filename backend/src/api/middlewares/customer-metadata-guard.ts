import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * The store lets customers write `metadata` on sign-up and profile update, which
 * would let anyone clear their own `email_verification_required` flag. Sign-up
 * metadata is replaced by the flag (set before the account exists, no gap);
 * profile updates lose `metadata` altogether (Medusa replaces the whole object
 * on write; the storefront never sends it).
 */
const edit = (req: MedusaRequest, apply: (b: Record<string, unknown>) => void) => {
  for (const body of [req.body, (req as { validatedBody?: unknown }).validatedBody]) {
    if (body && typeof body === "object") apply(body as Record<string, unknown>)
  }
}

export function stampSignupVerificationMiddleware(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  edit(req, (b) => {
    b.metadata = { email_verification_required: true }
  })
  next()
}

export function stripCustomerMetadataMiddleware(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  edit(req, (b) => {
    delete b.metadata
  })
  next()
}
