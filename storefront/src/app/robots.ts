import { MetadataRoute } from "next"

import { getBaseURL } from "@lib/util/env"

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseURL()

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/*/account",
        "/*/checkout",
        "/*/cart",
        // Token/id-addressed transactional pages reached from email links.
        // Never content; crawling them just produces canonical-less duplicates.
        "/*/artwork-approval",
        "/*/quote-accept",
        "/*/quote-approval",
        "/*/group-order",
        "/*/order/confirmed",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
