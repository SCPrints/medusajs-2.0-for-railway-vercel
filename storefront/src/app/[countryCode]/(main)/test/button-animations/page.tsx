import { redirect } from "next/navigation"

import { animationLabFirstButtonPage } from "@modules/test/animation-lab-constants"

type PageProps = {
  params: Promise<{ countryCode: string }>
}

/**
 * Add-to-cart interaction tests live on the unified animation lab route.
 * This path is kept so bookmarks and footers stay valid.
 */
export default async function ButtonAnimationsTestPage({ params }: PageProps) {
  const { countryCode } = await params
  redirect(
    `/${countryCode}/test/animation-widgets?page=${animationLabFirstButtonPage()}`
  )
}
