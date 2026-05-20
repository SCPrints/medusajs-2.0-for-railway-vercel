import { Metadata } from "next"

import BlehAnimation from "./bleh-animation"

export const metadata: Metadata = { title: "Bleh" }

export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

export default function BlehPage() {
  return <BlehAnimation />
}
