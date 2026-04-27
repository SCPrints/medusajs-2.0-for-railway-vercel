import { Metadata } from "next"

import { getBaseURL } from "@lib/util/env"
import MainStoreShell from "@modules/layout/templates/main-store-shell"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function PageLayout(props: { children: React.ReactNode }) {
  return <MainStoreShell>{props.children}</MainStoreShell>
}
