import { buildPolicyMetadata } from "@modules/policies/metadata"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps) {
  return buildPolicyMetadata({
    params,
    pathSegment: "shipping-policy",
    title: "Shipping Policy",
    description:
      "How SC PRINTS delivers custom orders across Australia: production time, carriers, tracking, rates, and support for damaged or lost shipments.",
  })
}

export default function ShippingPolicyPage() {
  return (
    <div className="content-container py-14 small:py-20">
      <article className="mx-auto max-w-3xl">
        <h1 className="page-title-marketing tracking-tight">Shipping Policy</h1>

        <p className="mt-8 text-base leading-relaxed text-ui-fg-subtle">
          At SC PRINTS, we take great care in producing and packaging your custom orders. Below you
          will find details on how we get our products from our studio to your door.
        </p>

        <div className="mt-10 space-y-10 border-t border-ui-border-base pt-10">
          <section>
            <h2 className="text-xl font-semibold text-ui-fg-base">1. Delivery Areas</h2>
            <p className="mt-3 text-sm leading-relaxed text-ui-fg-subtle">
              We ship nationwide across Australia, including all states and territories.
            </p>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed text-ui-fg-subtle">
              <li>
                <span className="font-medium text-ui-fg-base">Domestic:</span> We deliver to
                residential addresses, business addresses, and PO Boxes (via Australia Post).
              </li>
              <li>
                <span className="font-medium text-ui-fg-base">International:</span> Currently, we only
                ship within Australia.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ui-fg-base">2. Processing and Production Time</h2>
            <p className="mt-3 text-sm leading-relaxed text-ui-fg-subtle">
              Because our items are custom-made, your order goes through a production phase before
              shipping:
            </p>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed text-ui-fg-subtle">
              <li>
                <span className="font-medium text-ui-fg-base">Standard Production:</span> Typically
                3–7 business days following artwork approval.
              </li>
              <li>
                <span className="font-medium text-ui-fg-base">Express Production:</span> Available
                for select items for an additional fee, reducing lead time to 1–2 business days.
              </li>
              <li>
                <span className="font-medium text-ui-fg-base">Split Shipments:</span> To get your
                items to you as fast as possible, orders with multiple products may occasionally be
                shipped in separate parcels. You will receive unique tracking numbers for each.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ui-fg-base">3. Shipping Rates and Timeframes</h2>
            <p className="mt-3 text-sm leading-relaxed text-ui-fg-subtle">
              Shipping costs are calculated at checkout based on the weight, dimensions, and
              destination of your order.
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-ui-border-base">
              <table className="w-full min-w-[280px] text-left text-sm text-ui-fg-subtle">
                <thead>
                  <tr className="border-b border-ui-border-base bg-ui-bg-subtle">
                    <th className="px-4 py-3 font-semibold text-ui-fg-base">Service</th>
                    <th className="px-4 py-3 font-semibold text-ui-fg-base">
                      Estimated Delivery (After Production)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-ui-border-base">
                    <td className="px-4 py-3 font-medium text-ui-fg-base">Standard Shipping</td>
                    <td className="px-4 py-3">
                      3–6 Business Days (Metro) / 7–12 Days (Regional)
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-ui-fg-base">Express Shipping</td>
                    <td className="px-4 py-3">1–3 Business Days (Metro)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ui-fg-subtle">
              <span className="font-medium text-ui-fg-base">Note:</span> Delivery timeframes are
              estimates provided by our carriers and are in addition to our production lead times.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ui-fg-base">4. Carriers and Tracking</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-ui-fg-subtle">
              <p>
                We partner with Australia Post and reputable local couriers (such as StarTrack or
                Aramex) to ensure reliable delivery.
              </p>
              <p>
                Once your order is dispatched, you will receive a Shipping Confirmation email
                containing your tracking number.
              </p>
              <p>Please allow up to 24 hours for the tracking link to become active.</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ui-fg-base">5. Damaged or Lost Shipments</h2>
            <p className="mt-3 text-sm leading-relaxed text-ui-fg-subtle">
              We want your prints to arrive in gallery-quality condition.
            </p>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed text-ui-fg-subtle">
              <li>
                <span className="font-medium text-ui-fg-base">Damaged Items:</span> If your order
                arrives damaged, please take clear photos of the packaging and the product and
                contact us within 48 hours of delivery. We will prioritise a replacement for any items damaged
                in transit.
              </li>
              <li>
                <span className="font-medium text-ui-fg-base">Lost Parcels:</span> If your tracking
                information shows &quot;delivered&quot; but you haven&apos;t received it, or if it
                has stopped updating for more than 5 business days, please reach out to us so we can
                open an investigation with the carrier.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ui-fg-base">6. Incorrect Address &amp; Redelivery</h2>
            <p className="mt-3 text-sm leading-relaxed text-ui-fg-subtle">
              Please double-check your shipping address at checkout. If a parcel is returned to us
              due to an incorrect address provided by the customer, a redelivery fee may apply to
              ship the item a second time.
            </p>
          </section>
        </div>
      </article>
    </div>
  )
}
