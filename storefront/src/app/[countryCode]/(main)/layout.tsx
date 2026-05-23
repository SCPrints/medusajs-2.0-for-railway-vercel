import { Metadata } from "next"
import { Suspense } from "react"

import { getBaseURL } from "@lib/util/env"
import MainStoreShell from "@modules/layout/templates/main-store-shell"
import ChatWidget from "@modules/chatbot/components/chat-widget-lazy"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function PageLayout(props: { children: React.ReactNode }) {
  return (
    <MainStoreShell>
      <Suspense fallback={null}>{props.children}</Suspense>
      <ChatWidget />
    </MainStoreShell>
  )
}
