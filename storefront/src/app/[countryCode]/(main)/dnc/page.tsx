import { redirect } from "next/navigation"

const DNC_BRAND = "DNC Workwear"

type PageProps = {
  params: Promise<{ countryCode: string }>
}

export default async function DncBrandPage({ params }: PageProps) {
  const { countryCode } = await params
  redirect(
    `/${countryCode}/store?brand=${encodeURIComponent(DNC_BRAND)}`
  )
}
