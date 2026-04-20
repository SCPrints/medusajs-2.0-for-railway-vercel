import { buildPolicyMetadata } from "@modules/policies/metadata"
import PolicyPlaceholderPage from "@modules/policies/components/policy-placeholder-page"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps) {
  return buildPolicyMetadata({
    params,
    pathSegment: "terms-and-conditions",
    title: "Terms & Conditions",
    description:
      "Placeholder terms and conditions for SC PRINTS. Ordering, pricing, artwork approval, and liability will be set out here.",
  })
}

export default function TermsAndConditionsPage() {
  return (
    <PolicyPlaceholderPage
      title="Terms & Conditions"
      intro="This is placeholder text only and does not create a binding agreement. Replace with terms reviewed by your lawyer before you rely on them for commerce."
      sections={[
        {
          heading: "Agreement to these terms",
          body: [
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Placeholder: by placing an order or using the site, the customer agrees to these terms.",
          ],
        },
        {
          heading: "Orders, pricing, and payment",
          body: [
            "Dummy text: quotes, GST, accepted payment methods, when contracts are formed, and right to refuse orders.",
            "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium — replace with your commercial terms.",
          ],
        },
        {
          heading: "Artwork, proofs, and approvals",
          body: [
            "Placeholder: customer warrants they own or have rights to artwork, colours may vary, and production starts after written approval.",
          ],
        },
        {
          heading: "Production timelines and force majeure",
          body: [
            "Filler: estimated dates are estimates; delays due to supply, equipment, or events outside reasonable control.",
          ],
        },
        {
          heading: "Limitation of liability",
          body: [
            "Placeholder only. Australian consumer law may imply guarantees that cannot be excluded — obtain legal advice before publishing liability caps.",
          ],
        },
        {
          heading: "Governing law",
          body: [
            "Dummy text: which state or country’s laws apply and where disputes are heard. Replace with your chosen jurisdiction after legal review.",
          ],
        },
      ]}
    />
  )
}
