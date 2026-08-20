import { defineMiddlewares } from "@medusajs/framework/http"

import { smartVariantSearchMiddleware } from "./middlewares/smart-variant-search"
import { checkoutPriceInvariantMiddleware } from "./middlewares/checkout-price-invariant"

/**
 * Default Express JSON limit is ~100kb; customizer render payloads include
 * base64 image data and exceed that. Without this, Medusa logs
 * "request entity too large" and returns 500 for render-print / render-mockup.
 */
const CUSTOMIZER_BODY_LIMIT = "32mb"

export default defineMiddlewares({
  routes: [
    {
      // Smart variant search: turns "staple black" or "dnc-4232" into a
      // matching variant-id filter so staff don't have to type SKUs to find
      // the variant they want. See ./middlewares/smart-variant-search.ts.
      matcher: "/admin/product-variants",
      methods: ["GET"],
      middlewares: [smartVariantSearchMiddleware],
    },
    {
      // Pricing invariant — last gate before a cart becomes an order.
      // Default mode "alert" only observes; see PRICING_INVARIANT_MODE.
      matcher: "/store/carts/:id/complete",
      methods: ["POST"],
      middlewares: [checkoutPriceInvariantMiddleware],
    },
    {
      matcher: "/store/customizer/render-print",
      methods: ["POST"],
      bodyParser: { sizeLimit: CUSTOMIZER_BODY_LIMIT },
    },
    {
      matcher: "/store/customizer/render-mockup",
      methods: ["POST"],
      bodyParser: { sizeLimit: CUSTOMIZER_BODY_LIMIT },
    },
    {
      matcher: "/store/customizer/upload-original",
      methods: ["POST"],
      bodyParser: { sizeLimit: CUSTOMIZER_BODY_LIMIT },
    },
    {
      // Contact-form attachments — a single artwork file base64-encoded in the
      // JSON body. The route caps the decoded file at 20MB; base64 inflates by
      // ~1.33x so 32mb covers it. Without this the default ~100kb limit rejects
      // every real artwork file with a generic 500.
      matcher: "/store/contact/attachments",
      methods: ["POST"],
      bodyParser: { sizeLimit: CUSTOMIZER_BODY_LIMIT },
    },
    {
      matcher: "/admin/orders/:id/revised-proof",
      methods: ["POST"],
      bodyParser: { sizeLimit: "12mb" },
    },
    {
      matcher: "/admin/orders/:id/production-photos",
      methods: ["POST"],
      bodyParser: { sizeLimit: "12mb" },
    },
    {
      // Lookbook tile create — staff upload a photo as a base64 data URL in
      // the JSON body. Route caps the decoded image at 8MB (MAX_BYTES); base64
      // inflates by ~1.33x so 12mb covers it. Without this the default ~100kb
      // limit rejects every real photo with a generic "unknown_error" 500.
      matcher: "/admin/lookbook",
      methods: ["POST"],
      bodyParser: { sizeLimit: "12mb" },
    },
    {
      matcher: "/store/carts/:id/scp-line-items",
      methods: ["POST"],
      bodyParser: { sizeLimit: "4mb" },
    },
    {
      // Bulk-order grid posts up to 300 lines in one request. Each line
      // carries a CustomizerMetadata payload (~5-15kb after sanitiseation)
      // so the worst case is ~5MB — keep headroom at 32mb to match the
      // customizer render limit.
      matcher: "/store/carts/:id/scp-line-items-batch",
      methods: ["POST"],
      bodyParser: { sizeLimit: "32mb" },
    },
    {
      matcher: "/store/carts/:id/embroidery-line-items",
      methods: ["POST"],
      bodyParser: { sizeLimit: "4mb" },
    },
    {
      // Quote "Design in Studio" relay — the customiser posts one or more
      // lines each carrying a (sanitised) customizerDesign payload. Same
      // headroom as the per-line cart routes; data URLs are already swapped
      // for hosted URLs client-side so real payloads stay small.
      matcher: "/store/quotes/:id/design-items",
      methods: ["POST"],
      bodyParser: { sizeLimit: "4mb" },
    },
    {
      // Admin quote update — "Save line items" can re-send several lines each
      // carrying a customizerDesign payload, which blows the ~100kb default.
      matcher: "/admin/quotes/:id",
      methods: ["POST"],
      bodyParser: { sizeLimit: "8mb" },
    },
    {
      // Gildan supplier xlsx upload — base64-encoded in the request body.
      // The 2026-01 file is ~600KB on disk → ~2.1MB base64; headroom up to
      // 32mb covers future catalog growth without further config changes.
      matcher: "/admin/gildan/import",
      methods: ["POST"],
      bodyParser: { sizeLimit: "32mb" },
    },
    {
      // ShipStation v2 webhook endpoint. Preserve the raw request body so we
      // can verify the HMAC-SHA256 signature header.
      matcher: "/hooks/shipstation",
      methods: ["POST"],
      bodyParser: {
        preserveRawBody: true,
        sizeLimit: "1mb",
      },
    },
    {
      // Stripe webhook for admin-created Payment Links. Stripe signs the raw
      // body, so we must preserve it for `stripe.webhooks.constructEvent`.
      matcher: "/hooks/stripe-payment-link",
      methods: ["POST"],
      bodyParser: {
        preserveRawBody: true,
        sizeLimit: "1mb",
      },
    },
    {
      // Resend webhook for bounce / spam-complaint / open / click events.
      // Svix signs the raw body — preserved verbatim for the signature
      // check in lib/resend-webhook.ts.
      matcher: "/hooks/resend",
      methods: ["POST"],
      bodyParser: {
        preserveRawBody: true,
        sizeLimit: "256kb",
      },
    },
  ],
})
