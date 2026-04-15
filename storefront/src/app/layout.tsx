import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"
import { ViewTransitions } from "next-view-transitions"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <ViewTransitions>
      <html lang="en" data-mode="light">
        <body>
          <main className="relative">{props.children}</main>
        </body>
      </html>
    </ViewTransitions>
  )
}