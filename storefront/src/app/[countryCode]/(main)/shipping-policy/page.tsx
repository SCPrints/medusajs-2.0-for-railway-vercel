import { buildPolicyMetadata } from "@modules/policies/metadata"
import PolicyPlaceholderPage from "@modules/policies/components/policy-placeholder-page"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps) {
  return buildPolicyMetadata({
    params,
    pathSegment: "shipping-policy",
    title: "Shipping Policy",
    description:
      "Placeholder shipping policy for SC PRINTS. Delivery timeframes, carriers, and regions will be listed here.",
  })
}

export default function ShippingPolicyPage() {
  return (
    <PolicyPlaceholderPage
      title="Shipping Policy"
      intro="This is placeholder text. Replace it with your real shipping policy, including delivery areas, timeframes, fees, and how tracking works."
      sections={[
        {
          heading: "Delivery areas",
          body: [
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
            "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
          ],
        },
        {
          heading: "Processing and dispatch",
          body: [
            "Custom decorated orders typically require production time after artwork approval. Placeholder: describe your standard handling time vs. express options.",
            "Orders may ship in multiple parcels if items are produced at different times. Dummy text only — update with your fulfilment process.",
          ],
        },
        {
          heading: "Carriers and tracking",
          body: [
            "Placeholder: name the carriers you use (e.g. Australia Post, couriers) and when tracking numbers are sent.",
            "If a shipment is delayed by the carrier, we will provide dummy support steps here until you add the real process.",
          ],
        },
        {
          heading: "Damaged or lost shipments",
          body: [
            "This section is filler. Replace with how customers should report damage, time limits for claims, and whether you replace or refund.",
          ],
        },
      ]}
    />
  )
}
