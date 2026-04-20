import { buildPolicyMetadata } from "@modules/policies/metadata"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps) {
  return buildPolicyMetadata({
    params,
    pathSegment: "privacy-policy",
    title: "Privacy Policy",
    description:
      "How SC PRINTS collects, uses, and manages personal information in line with the Australian Privacy Principles.",
  })
}

export default function PrivacyPolicyPage() {
  return (
    <div className="content-container py-14 small:py-20">
      <article className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-ui-fg-base">Privacy Policy</h1>
        <p className="mt-3 text-sm font-medium text-ui-fg-muted">Last Updated: April 20, 2026</p>

        <p className="mt-8 text-base leading-relaxed text-ui-fg-subtle">
          At SC PRINTS, we respect your privacy and are committed to protecting your personal
          information. This policy outlines how we collect, use, and manage your data in accordance
          with the Australian Privacy Principles.
        </p>

        <div className="mt-10 space-y-10 border-t border-ui-border-base pt-10">
          <section>
            <h2 className="text-xl font-semibold text-ui-fg-base">1. Who We Are</h2>
            <p className="mt-3 text-sm leading-relaxed text-ui-fg-subtle">
              SC PRINTS operates in Sydney, Australia.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ui-fg-base">2. Information We Collect</h2>
            <p className="mt-3 text-sm leading-relaxed text-ui-fg-subtle">
              We collect personal information that is reasonably necessary for our business
              functions. This includes:
            </p>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed text-ui-fg-subtle">
              <li>
                <span className="font-medium text-ui-fg-base">Identity &amp; Contact Data:</span>{" "}
                Name, shipping address, billing address, and email address.
              </li>
              <li>
                <span className="font-medium text-ui-fg-base">Transaction Data:</span> Details about
                payments to and from you and details of products you have purchased. (Note: We do not
                store full credit card numbers; these are handled by our secure payment processors).
              </li>
              <li>
                <span className="font-medium text-ui-fg-base">User Content:</span> Artwork files,
                designs, or images you upload for printing.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ui-fg-base">3. How We Use Your Information</h2>
            <p className="mt-3 text-sm leading-relaxed text-ui-fg-subtle">
              We use your information to provide our services effectively, including:
            </p>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed text-ui-fg-subtle">
              <li>
                <span className="font-medium text-ui-fg-base">Order Fulfilment:</span> Processing
                payments, printing your designs, and delivering your products.
              </li>
              <li>
                <span className="font-medium text-ui-fg-base">Support:</span> Responding to your
                inquiries or resolving order issues.
              </li>
              <li>
                <span className="font-medium text-ui-fg-base">Marketing:</span> Sending updates or
                promotions, provided you have opted in (you can unsubscribe at any time).
              </li>
              <li>
                <span className="font-medium text-ui-fg-base">Security:</span> To prevent fraudulent
                transactions and protect our website.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ui-fg-base">4. Disclosure of Information</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-ui-fg-subtle">
              <p>
                We do not sell your personal information. However, we may share data with trusted
                third parties to run our business:
              </p>
              <ul className="list-disc space-y-3 pl-5">
                <li>
                  <span className="font-medium text-ui-fg-base">Service Providers:</span> Delivery
                  couriers, payment gateways (e.g., Stripe, PayPal), and email marketing platforms.
                </li>
                <li>
                  <span className="font-medium text-ui-fg-base">Professional Advisers:</span>{" "}
                  Lawyers, auditors, or insurers if required.
                </li>
                <li>
                  <span className="font-medium text-ui-fg-base">Overseas Disclosure:</span> Some of
                  our digital service providers (like web hosting or analytics) may store data on
                  servers located outside of Australia (e.g., USA, Singapore). By using our site, you
                  consent to this transfer.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ui-fg-base">5. Data Security and Retention</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-ui-fg-subtle">
              <p>
                We implement industry-standard security measures, including SSL encryption, to protect
                your data from unauthorized access or loss.
              </p>
              <p>
                We retain your personal information only for as long as necessary to fulfil the
                purposes we collected it for, including any legal, accounting, or reporting
                requirements.
              </p>
            </div>
          </section>
        </div>
      </article>
    </div>
  )
}
