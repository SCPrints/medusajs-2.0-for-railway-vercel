import { buildPolicyMetadata } from "@modules/policies/metadata"
import PolicyPlaceholderPage from "@modules/policies/components/policy-placeholder-page"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps) {
  return buildPolicyMetadata({
    params,
    pathSegment: "privacy-policy",
    title: "Privacy Policy",
    description:
      "Placeholder privacy policy for SC PRINTS. Data collection, use, storage, and rights will be documented here.",
  })
}

export default function PrivacyPolicyPage() {
  return (
    <PolicyPlaceholderPage
      title="Privacy Policy"
      intro="This is placeholder text only and is not legal advice. Engage a qualified professional to draft a privacy policy that complies with Australian privacy law and any other jurisdictions you serve."
      sections={[
        {
          heading: "Who we are",
          body: [
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Placeholder: identify SC PRINTS, contact details, and the entity responsible for personal information.",
          ],
        },
        {
          heading: "Information we collect",
          body: [
            "Dummy list narrative: account details, order and payment information, delivery addresses, artwork files, device and usage data, and marketing preferences.",
            "Replace with accurate categories tied to your website, checkout, email tools, and analytics.",
          ],
        },
        {
          heading: "How we use information",
          body: [
            "Placeholder: fulfilling orders, customer support, fraud prevention, improving services, and marketing where permitted.",
          ],
        },
        {
          heading: "Sharing and overseas disclosure",
          body: [
            "Filler text: describe processors (e.g. hosting, email, payments) and whether data may be stored outside Australia.",
          ],
        },
        {
          heading: "Security and retention",
          body: [
            "Placeholder for how you protect data and how long you keep different categories of information.",
          ],
        },
        {
          heading: "Your rights and contact",
          body: [
            "Dummy paragraph: how customers can access, correct, or complain about personal information handling. Replace with real procedures.",
          ],
        },
      ]}
    />
  )
}
