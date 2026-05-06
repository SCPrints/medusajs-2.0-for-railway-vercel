import { Metadata } from "next"

import { getBaseURL } from "@lib/util/env"
import MainStoreShell from "@modules/layout/templates/main-store-shell"
import ChatWidget from "@modules/chatbot/components/chat-widget"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function PageLayout(props: { children: React.ReactNode }) {
  return (
    <MainStoreShell>
      {props.children}
      <ChatWidget />
    </MainStoreShell>
  )
}
