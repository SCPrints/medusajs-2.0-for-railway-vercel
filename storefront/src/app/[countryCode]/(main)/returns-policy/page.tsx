import { buildPolicyMetadata } from "@modules/policies/metadata"
import PolicyPlaceholderPage from "@modules/policies/components/policy-placeholder-page"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps) {
  return buildPolicyMetadata({
    params,
    pathSegment: "returns-policy",
    title: "Returns Policy",
    description:
      "Placeholder returns and refunds policy for SC PRINTS. Eligibility, timeframes, and custom goods rules will be defined here.",
  })
}

export default function ReturnsPolicyPage() {
  return (
    <PolicyPlaceholderPage
      title="Returns Policy"
      intro="This is placeholder text. Custom printed and embroidered goods often have different return rules than standard retail — replace this with your final policy."
      sections={[
        {
          heading: "Change of mind",
          body: [
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Placeholder: state whether change-of-mind returns are accepted for blank stock vs. decorated goods.",
            "Integer posuere erat a ante venenatis dapibus posuere velit aliquet. Dummy paragraph — add restocking fees or exclusions as needed.",
          ],
        },
        {
          heading: "Faulty or incorrect items",
          body: [
            "Replace this filler with how customers notify you of defects, required photos, and acceptable resolution (remake, credit, or refund).",
            "Vestibulum id ligula porta felis euismod semper. Placeholder for deadlines (e.g. report within 7 days of delivery).",
          ],
        },
        {
          heading: "Custom and made-to-order work",
          body: [
            "Custom decoration usually cannot be resold. Dummy text: clarify that approved proofs and signed-off artwork may limit cancellation and return rights.",
          ],
        },
        {
          heading: "How to start a return",
          body: [
            "Placeholder steps: contact support, receive an RMA, ship items back with labels, etc. Replace with your real workflow and address details.",
          ],
        },
      ]}
    />
  )
}
