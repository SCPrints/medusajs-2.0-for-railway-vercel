import { defineMiddlewares } from "@medusajs/framework/http"

import { smartVariantSearchMiddleware } from "./middlewares/smart-variant-search"

/**
 * Default Express JSON limit is ~100kb; customizer render payloads include
 * base64 image data and exceed that. Without this, Medusa logs
 * "request entity too large" and returns 500 for render-print / render-mockup.
 */
const CUSTOMIZER_BODY_LIMIT = "32mb"

export default defineMiddlewares({
  routes: [
    {
      // Multi-term smart variant search: turns "staple black" into a
      // matching variant-id filter so staff don't have to type SKUs to find
      // the variant they want. See ./middlewares/smart-variant-search.ts.
      matcher: "/admin/product-variants",
      methods: ["GET"],
      middlewares: [smartVariantSearchMiddleware],
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
