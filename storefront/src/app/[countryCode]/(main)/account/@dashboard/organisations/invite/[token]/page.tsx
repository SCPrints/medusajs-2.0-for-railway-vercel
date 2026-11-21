import { Metadata } from "next"

import { getCustomer } from "@lib/data/customer"
import { getInvitePreview } from "@lib/data/identity"
import InviteCard from "@modules/account/components/organisations/invite-card"

export const metadata: Metadata = {
  title: "Join an organisation",
  robots: { index: false, follow: false },
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const customer = await getCustomer()
  // The account layout shows the sign-in form when signed out, so a customer is always here.
  const preview = customer ? await getInvitePreview(token) : null
  return <InviteCard token={token} preview={preview} />
}
