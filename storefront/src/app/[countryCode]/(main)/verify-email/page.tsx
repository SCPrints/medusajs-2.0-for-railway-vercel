import { Metadata } from "next"

import VerifyEmail from "@modules/account/components/verify-email"

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; exp?: string; sig?: string }>
}) {
  const { email = "", exp = "", sig = "" } = await searchParams
  return (
    <div className="content-container py-12 max-w-2xl">
      <VerifyEmail email={email} exp={exp} sig={sig} />
    </div>
  )
}
