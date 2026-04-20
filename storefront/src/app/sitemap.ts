import { MetadataRoute } from "next"

import { getBaseURL } from "@lib/util/env"
import { services } from "@modules/services/data"

const defaultCountryCode = process.env.NEXT_PUBLIC_DEFAULT_REGION || "au"

const toAbsoluteUrl = (path: string) => new URL(path, getBaseURL()).toString()

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const marketingPaths = [
    `/${defaultCountryCode}`,
    `/${defaultCountryCode}/store`,
    `/${defaultCountryCode}/services`,
    `/${defaultCountryCode}/contact`,
    `/${defaultCountryCode}/faq`,
    `/${defaultCountryCode}/shipping-policy`,
    `/${defaultCountryCode}/returns-policy`,
    `/${defaultCountryCode}/privacy-policy`,
    `/${defaultCountryCode}/terms-and-conditions`,
  ]

  const servicePaths = services.map(
    (service) => `/${defaultCountryCode}/services/${service.slug}`
  )

  return [...marketingPaths, ...servicePaths].map((path) => ({
    url: toAbsoluteUrl(path),
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === `/${defaultCountryCode}` ? 1 : 0.7,
  }))
}
