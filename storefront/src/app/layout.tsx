import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans } from "next/font/google"
import { Suspense } from "react"
import "styles/globals.css"
import { ViewTransitions } from "next-view-transitions"
import ConditionalCursorDot from "@modules/layout/components/conditional-cursor-dot"
import { Ga4Script } from "@modules/common/components/ga4-script"
import { MetaPixel } from "@modules/common/components/meta-pixel"
import { PostHogProvider } from "@modules/common/components/posthog-provider"
import AddToHomeBanner from "@modules/common/components/add-to-home-banner"
import ServiceWorkerRegister from "@modules/common/components/service-worker-register"

const plusJakartaSans = Plus_Jakarta_Sans({ 
  subsets: ["latin"],
  display: "swap", 
})

export const viewport: Viewport = {
  themeColor: "#EEEEEE",
  width: "device-width",
  initialScale: 1,
}

// NEW: Upgraded SEO & Social Media sharing configuration
export const metadata: Metadata = {
  metadataBase: new URL(buildAbsoluteUrl("/")),
  title: {
    template: `%s | ${SEO.siteName}`,
    default: `${SEO.siteName} | Custom Apparel & Merch`,
  },
  description: SEO.siteDescription,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SC Prints",
  },
  icons: {
    apple: "/branding/scp-vector.svg",
  },
  // ponytail: NO `alternates.canonical` here. Next.js inherits metadata down
  // the segment tree, so a root canonical of "/" was emitted verbatim on every
  // page that didn't set its own — telling Google that /au/store, the search
  // results, and every token page were all duplicates of the homepage. That is
  // exactly the "Alternative page with proper canonical tag" / "Duplicate,
  // Google chose different canonical" exclusion. Each page sets its own
  // self-referencing canonical; pages without one self-canonicalise.
  keywords: [
    "custom apparel Australia",
    "screen printing",
    "embroidery",
    "digital transfers",
    "uv printing",
    "uniform branding",
    "bulk merch",
  ],
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: "oY0Zolz7R7nfAyd2YQ4uLCrKxdIi0dXVFZt6KVbJR28",
  },
  openGraph: {
    type: "website",
    locale: SEO.locale,
    siteName: SEO.siteName,
    url: buildAbsoluteUrl("/"),
    title: `${SEO.siteName} | Custom Apparel & Merch`,
    description: SEO.siteDescription,
    images: [
      {
        url: SEO.ogImage,
        width: 768,
        height: 1024,
        alt: "SC Prints logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SEO.siteName} | Custom Apparel & Merch`,
    description: SEO.siteDescription,
    images: [SEO.ogImage],
  },
}

const organizationStructuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SEO.siteName,
  url: buildAbsoluteUrl("/"),
  logo: buildAbsoluteUrl(SEO.ogImage),
  email: SEO.contactEmail,
  telephone: SEO.contactPhone,
  address: {
    "@type": "PostalAddress",
    addressCountry: SEO.country,
  },
  areaServed: SEO.country,
}

const localBusinessStructuredData = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: SEO.siteName,
  image: buildAbsoluteUrl(SEO.ogImage),
  url: buildAbsoluteUrl("/"),
  email: SEO.contactEmail,
  telephone: SEO.contactPhone,
  address: {
    "@type": "PostalAddress",
    addressCountry: SEO.country,
  },
  areaServed: {
    "@type": "Country",
    name: "Australia",
  },
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="light" className="scroll-smooth">
      <head>
        {/*
          Preconnect to origins we hit on every page. Saves ~100-300ms TLS +
          DNS round-trip per origin on the first request to each — meaningful
          on phone networks. Cross-origin since these aren't same-origin.
        */}
        <link
          rel="preconnect"
          href="https://api.scprints.com.au"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://aussiepacific-images.s3.ap-southeast-2.amazonaws.com"
          crossOrigin="anonymous"
        />
        <link
          rel="dns-prefetch"
          href="https://www.googletagmanager.com"
        />
      </head>
      <body
        className={`${plusJakartaSans.className} antialiased selection:bg-[#FF2E63] selection:text-[#EEEEEE]`}
      >
        <Ga4Script />
        <MetaPixel />
        <PostHogProvider>
          <Suspense fallback={null}>
            <ConditionalCursorDot />
          </Suspense>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify([organizationStructuredData, localBusinessStructuredData]),
            }}
          />
          <Suspense fallback={null}>
            <ViewTransitions>
              <main className="relative min-h-dvh bg-[var(--brand-background)] text-[var(--brand-primary)]">
                {props.children}
              </main>
            </ViewTransitions>
          </Suspense>
          <AddToHomeBanner />
          <ServiceWorkerRegister />
        </PostHogProvider>
      </body>
    </html>
  )
}