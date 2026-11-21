import type { SupplierDocument } from "@lib/data/documents"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import { shortDate } from "../quotes/format"

const row = "flex min-h-14 items-center justify-between gap-3 px-4 py-3"
const link = "inline-flex min-h-11 items-center rounded-md border border-ui-border-base bg-white px-4 text-sm font-semibold text-ui-fg-base! hover:bg-ui-bg-subtle"

const DocumentsList = ({ documents }: { documents: SupplierDocument[] }) => (
  <div className="flex flex-col gap-8" data-testid="documents">
    <section aria-label="SC Prints documents">
      <h2 className="mb-1 text-lg font-semibold text-ui-fg-base">SC Prints documents</h2>
      <p className="mb-3 text-sm text-ui-fg-subtle">Our details for your supplier records.</p>
      {documents.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ui-border-base p-6 text-center text-sm text-ui-fg-subtle">
          Nothing here yet. Need a certificate? Email info@scprints.com.au and we&apos;ll send it.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-ui-border-base bg-white">
          {documents.map((d) => (
            <li key={d.id} className={row}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ui-fg-base">{d.title}</p>
                <p className="text-xs text-ui-fg-subtle">Updated {shortDate(d.updated_at)}</p>
              </div>
              <a href={d.url} target="_blank" rel="noreferrer" download className={link} data-testid="supplier-document-link">
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>

    <section aria-label="Your documents">
      <h2 className="mb-3 text-lg font-semibold text-ui-fg-base">Your documents</h2>
      <ul className="divide-y divide-gray-100 rounded-xl border border-ui-border-base bg-white">
        <li className={row}>
          <span className="text-sm text-ui-fg-base">Tax invoices, proofs and artwork for each order</span>
          <LocalizedClientLink href="/account/orders" className={link}>Orders</LocalizedClientLink>
        </li>
        <li className={row}>
          <span className="text-sm text-ui-fg-base">Statement of invoices</span>
          <LocalizedClientLink href="/account/spend" className={link}>Spend</LocalizedClientLink>
        </li>
        <li className={row}>
          <span className="text-sm text-ui-fg-base">Your price list</span>
          <LocalizedClientLink href="/account/prices" className={link}>Prices</LocalizedClientLink>
        </li>
        <li className={row}>
          <span className="text-sm text-ui-fg-base">Quotes</span>
          <LocalizedClientLink href="/account/quotes" className={link}>Quotes</LocalizedClientLink>
        </li>
      </ul>
    </section>
  </div>
)

export default DocumentsList
