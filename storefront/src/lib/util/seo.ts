import { getBaseURL } from "./env"

export const SEO = {
  siteName: "SC PRINTS",
  siteDescription:
    "Premium custom apparel, transfers, embroidery, and branding solutions for Australian businesses and teams.",
  contactEmail: "info@scprints.com.au",
  contactPhone: "+61390000000",
  locale: "en_AU",
  country: "AU",
  ogImage: "/branding/sc-prints-logo-transparent.png",
}

export const buildAbsoluteUrl = (path = "/") => new URL(path, getBaseURL()).toString()
