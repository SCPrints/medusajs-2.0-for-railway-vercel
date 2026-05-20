import { permanentRedirect } from "next/navigation"


export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

type PageProps = {
  params: Promise<{ countryCode: string }>
}

export default async function DncBrandPage({ params }: PageProps) {
  const { countryCode } = await params
  permanentRedirect(`/${countryCode}/brands/dnc-workwear`)
}
