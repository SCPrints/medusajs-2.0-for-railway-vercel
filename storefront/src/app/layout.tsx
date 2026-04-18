import { getBaseURL } from "@lib/util/env"
import { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans } from "next/font/google"
import "styles/globals.css"
import { ViewTransitions } from "next-view-transitions"

const plusJakartaSans = Plus_Jakarta_Sans({ 
  subsets: ["latin"],
  display: "swap", 
})

// NEW: Viewport settings to prevent awkward mobile zooming on inputs
export const viewport: Viewport = {
  themeColor: "#F5F7FA",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

// NEW: Upgraded SEO & Social Media sharing configuration
export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
  title: {
    template: "%s | SC PRINTS",
    default: "SC PRINTS | Custom Apparel & Merch",
  },
  description:
    "Premium custom apparel, transfers, embroidery, and branding solutions for Australian businesses and teams.",
  openGraph: {
    type: "website",
    locale: "en_AU",
    siteName: "SC PRINTS",
    images: [
      {
        url: "/branding/sc-prints-logo-transparent.png",
        width: 768,
        height: 1024,
        alt: "SC Prints logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/branding/sc-prints-logo-transparent.png"],
  },
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <ViewTransitions>
      <html lang="en" data-mode="light" className="scroll-smooth">
        <body 
          className={`${plusJakartaSans.className} antialiased selection:bg-[#FFD166] selection:text-[#1F2933]`}
        >
          <main className="relative">{props.children}</main>
        </body>
      </html>
    </ViewTransitions>
  )
}