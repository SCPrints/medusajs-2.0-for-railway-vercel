import { Metadata } from "next"

import ResetPassword from "@modules/account/components/reset-password"

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>
}) {
  const { token, email } = await searchParams
  return (
    <div className="content-container py-12">
      <ResetPassword token={token} email={email} />
    </div>
  )
}
