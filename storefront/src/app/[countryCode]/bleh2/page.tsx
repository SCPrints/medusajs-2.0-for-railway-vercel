import { Metadata } from "next"

import Bleh2Animation from "./bleh2-animation"


export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

export const metadata: Metadata = { title: "Bleh 2" }

export default function Bleh2Page() {
  return <Bleh2Animation />
}
