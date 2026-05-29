const checkEnvVariables = require("./check-env-variables")

checkEnvVariables()

/** Hostname only — env URLs may include paths (e.g. `https://store.com/au`). */
function hostnameFromEnvUrl(value) {
  if (!value || typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    return new URL(withProtocol).hostname
  } catch {
    return null
  }
}

// Vercel Pro includes Image Optimization, so /_next/image is available and we
// want it ON by default everywhere. The earlier Vercel-detection branch was a
// workaround for Hobby-plan 402 responses — no longer needed. Override with
// NEXT_PUBLIC_UNOPTIMIZED_IMAGES=true if you ever need to disable transforms
// (e.g. if the monthly optimization quota gets hit and you need a quick fallback
// to direct-CDN serving without redeploying).
const catalogImagesUnoptimized =
  process.env.NEXT_PUBLIC_UNOPTIMIZED_IMAGES === "true"

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Next 16 Cache Components / PPR. Replaces the older `experimental.ppr` flag.
  // Without this, any RSC reading cookies()/headers() (CartButton in the nav)
  // forces every descendant page dynamic; pages render fresh on every request
  // and Vercel responds with `cache-control: no-store`. With it, static shell
  // + cached data is served from the edge and Suspense boundaries (CartButton)
  // stream as dynamic holes.
  cacheComponents: true,
  // Next 16 removed the `eslint` config block — lint no longer runs as part
  // of `next build`. Use `pnpm lint` (standalone) to check. The repo has
  // ~24 pre-existing lint errors (mostly missing react/jsx-key in animation
  // demo components under src/modules/test/) that are tracked as a separate
  // clean-up task.
  //
  // TypeScript errors DO break the prod build (was previously suppressed
  // via `ignoreBuildErrors: true`). Baseline verified clean.
  typescript: {
    ignoreBuildErrors: false,
  },
  // ──────────────────────────────────────────────────────────────────
  // Large cart serialization limit (commit 6a66793)
  //
  // Symptom: when a cart contains 100+ customized items (each with
  // print metadata, pricing breakdowns, and design artifacts), the
  // RSC serialization of enrichLineItems() can exceed the default 1MB
  // limit, causing a silent serialization error and the cart page to
  // render the error boundary ("Something went wrong loading your cart").
  //
  // Fix: raise bodySizeLimit to 10mb to accommodate carts that
  // serialize enrichLineItems() with full CustomizerMetadata and
  // embroidery metadata payloads. The enrichLineItems() function
  // (src/lib/data/cart.ts) includes safeguard warnings when approaching
  // the 5mb threshold to catch future regressions.
  // ──────────────────────────────────────────────────────────────────
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    /**
     * Image Optimization is ON by default. Vercel Pro includes the quota; cards
     * use quality={50} (declared below in `qualities`) and `<Image fill sizes=...>`
     * so the optimizer serves the right size + WebP/AVIF per viewport.
     * Set NEXT_PUBLIC_UNOPTIMIZED_IMAGES=true to fall back to direct-CDN serving
     * (e.g. if /_next/image quota is exhausted mid-month).
     */
    unoptimized: catalogImagesUnoptimized,
    qualities: [40, 50, 75],
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      { 
        protocol: "https",
        hostname: hostnameFromEnvUrl(process.env.NEXT_PUBLIC_BASE_URL) ?? "localhost",
      },
      { 
        protocol: "https",
        hostname:
          hostnameFromEnvUrl(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "localhost",
      },
      { 
        protocol: "https",
        hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
      },
      { 
        protocol: "https",
        hostname: "medusa-server-testing.s3.amazonaws.com",
      },
      { 
        protocol: "https",
        hostname: "medusa-server-testing.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname:
          hostnameFromEnvUrl(process.env.NEXT_PUBLIC_MINIO_ENDPOINT) ?? "localhost",
      },
      // Customizer mockups + uploads use MINIO_PUBLIC_URL on the backend (R2 public
      // dev URL like pub-<hash>.r2.dev), which differs from the private S3 endpoint.
      {
        protocol: "https",
        hostname:
          hostnameFromEnvUrl(process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL) ??
          "localhost",
      },
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
      {
        protocol: "https",
        hostname: "cdn.fashionbizapps.nz",
      },
      {
        protocol: "https",
        hostname: "cdn11.bigcommerce.com",
      },
      {
        protocol: "https",
        hostname: "www.dncworkwear.com.au",
      },
      {
        protocol: "https",
        hostname: "dncworkwear.com.au",
      },
      {
        protocol: "https",
        hostname: "aussiepacific-images.s3.ap-southeast-2.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "www.ramo.com.au",
      },
    ],
  },
  // ──────────────────────────────────────────────────────────────────
  // Server-Action ID stability across deploys
  //
  // Symptom: after a Vercel deploy, any tab that was open before the
  // deploy throws `Server Action "<hash>" was not found on the server`
  // when the customer next clicks something (e.g. "Add to cart").
  // That hashed ID was generated by the previous build and the new
  // server doesn't recognise it.
  //
  // Fix: set the env var `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in the
  // Vercel project (Production + Preview). Next.js 15 reads it from
  // `process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` automatically
  // (see `next/dist/esm/server/app-render/encryption-utils.js`) and
  // uses it instead of the per-build random key. Same key across
  // deploys → same action IDs → tabs survive the deploy.
  //
  // Generate a value with:  openssl rand -base64 32
  // ──────────────────────────────────────────────────────────────────
}

// Wrap with @next/bundle-analyzer when ANALYZE=true. Only required at
// analyze time so devs/CI without the dep can still build normally.
if (process.env.ANALYZE === "true") {
  const withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: true,
  })
  module.exports = withBundleAnalyzer(nextConfig)
} else {
  module.exports = nextConfig
}