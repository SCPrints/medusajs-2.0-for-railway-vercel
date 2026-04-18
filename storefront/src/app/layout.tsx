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
    template: "%s | Your Store Name", // Automatically makes titles like: "Black T-Shirt | Your Store Name"
    default: "Your Store Name | Premium Apparel", // The title for your homepage
  },
  description: "Shop the latest premium collection. Fast shipping and easy returns.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Your Store Name",
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