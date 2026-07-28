import { MetadataRoute } from "next"

import { listBrands } from "@lib/data/brands"
import { listBundles } from "@lib/data/bundles"
import { listCategories } from "@lib/data/categories"
import { listAllProductHandles } from "@lib/data/products"
import { getBaseURL } from "@lib/util/env"
import { industries } from "@modules/industries/data/industries"
import { locations } from "@modules/locations/data/locations"
import { services } from "@modules/services/data"

const defaultCountryCode = process.env.NEXT_PUBLIC_DEFAULT_REGION || "au"

const toAbsoluteUrl = (path: string) => new URL(path, getBaseURL()).toString()

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const cc = defaultCountryCode

  // Static marketing + tool pages worth crawling. Sandbox/hero experiments,
  // cart, search, standalone customizer, account, nps, email-preferences are
  // intentionally excluded (noindex or non-content).
  const staticPaths = [
    `/${cc}`,
    `/${cc}/store`,
    `/${cc}/explore`,
    `/${cc}/brands`,
    `/${cc}/services`,
    `/${cc}/industries`,
    `/${cc}/locations`,
    `/${cc}/best-sellers`,
    `/${cc}/bundles`,
    `/${cc}/lookbook`,
    `/${cc}/dtf-builder`,
    `/${cc}/byo`,
    `/${cc}/spirits`,
    `/${cc}/contact`,
    `/${cc}/faq`,
    `/${cc}/guides/cmyk-dtf`,
    `/${cc}/sitemap`,
    `/${cc}/shipping-policy`,
    `/${cc}/returns-policy`,
    `/${cc}/privacy-policy`,
  ]

  const servicePaths = services.map((s) => `/${cc}/services/${s.slug}`)
  const industryPaths = industries.map((i) => `/${cc}/industries/${i.slug}`)
  const locationPaths = locations.map((l) => `/${cc}/locations/${l.slug}`)

  // Dynamic sets. Every helper already swallows backend errors → [] so one
  // slow/failing set never empties the whole sitemap.
  const [products, categories, brands, bundles] = await Promise.all([
    listAllProductHandles(),
    listCategories().catch(() => []),
    listBrands().catch(() => []),
    listBundles().catch(() => []),
  ])

  const staticEntries: MetadataRoute.Sitemap = [
    ...staticPaths,
    ...servicePaths,
    ...industryPaths,
    ...locationPaths,
  ].map((path) => ({
    url: toAbsoluteUrl(path),
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === `/${cc}` ? 1 : 0.7,
  }))

  const categoryEntries: MetadataRoute.Sitemap = categories
    .filter((c) => c?.handle)
    .map((c) => ({
      url: toAbsoluteUrl(`/${cc}/categories/${encodeURIComponent(c.handle)}`),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    }))

  const brandEntries: MetadataRoute.Sitemap = brands
    .filter((b) => b?.handle)
    .map((b) => ({
      url: toAbsoluteUrl(`/${cc}/brands/${encodeURIComponent(b.handle)}`),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    }))

  const bundleEntries: MetadataRoute.Sitemap = bundles
    .filter((b) => b?.status === "active" && b?.handle)
    .map((b) => ({
      url: toAbsoluteUrl(`/${cc}/bundles/${encodeURIComponent(b.handle)}`),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    }))

  const productEntries: MetadataRoute.Sitemap = products.map((p) => ({
    url: toAbsoluteUrl(`/${cc}/products/${encodeURIComponent(p.handle)}`),
    lastModified: p.updated_at ? new Date(p.updated_at) : now,
    changeFrequency: "weekly",
    priority: 0.6,
  }))

  return [
    ...staticEntries,
    ...categoryEntries,
    ...brandEntries,
    ...bundleEntries,
    ...productEntries,
  ]
}
