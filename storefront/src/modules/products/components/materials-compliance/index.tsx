import { HttpTypes } from "@medusajs/types"

import { mergeCompliance } from "@modules/products/lib/compliance"

const ROWS = [
  ["country_of_origin", "Country of origin"],
  ["fibre_content", "Fibre content"],
  ["fabric_weight", "Fabric weight"],
  ["care", "Care instructions"],
] as const

/** "Materials and compliance" on the product page. Renders nothing without data. */
const MaterialsCompliance = ({ product }: { product: HttpTypes.StoreProduct }) => {
  const brand = Array.isArray((product as any).brand) ? (product as any).brand[0] : (product as any).brand
  const c = mergeCompliance(brand?.metadata?.compliance, product.metadata?.compliance)
  if (!c) return null
  return (
    <section className="mt-8 border-t border-ui-border-base pt-6" data-testid="materials-compliance">
      <h3 className="mb-3 text-base font-semibold text-ui-fg-base">Materials and compliance</h3>
      <dl className="m-0 grid grid-cols-1 gap-x-8 gap-y-3 tablet:grid-cols-2">
        {ROWS.filter(([k]) => c[k]).map(([k, label]) => (
          <div key={k}>
            <dt className="font-semibold">{label}</dt>
            <dd className="m-0">{c[k]}</dd>
          </div>
        ))}
        {c.certifications?.length ? (
          <div>
            <dt className="font-semibold">Certifications</dt>
            <dd className="m-0">{c.certifications.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      {c.statement_url ? (
        <p className="mt-3">
          <a href={c.statement_url} target="_blank" rel="noreferrer" className="underline">
            Supplier statement
          </a>
        </p>
      ) : null}
    </section>
  )
}

export default MaterialsCompliance
