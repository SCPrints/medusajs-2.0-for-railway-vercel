import LocalizedClientLink from "@modules/common/components/localized-client-link"
import React from "react"

const Help = () => {
  return (
    <div className="bg-ui-bg-subtle rounded-xl p-6">
      <h3 className="text-base font-semibold text-[var(--brand-primary)] mb-3">
        Need help?
      </h3>
      <ul className="flex flex-col sm:flex-row gap-x-6 gap-y-2 text-sm">
        <li>
          <LocalizedClientLink
            href="/contact"
            className="text-[var(--brand-secondary)] hover:underline"
          >
            Contact
          </LocalizedClientLink>
        </li>
        <li>
          <LocalizedClientLink
            href="/contact"
            className="text-[var(--brand-secondary)] hover:underline"
          >
            Returns &amp; Exchanges
          </LocalizedClientLink>
        </li>
      </ul>
    </div>
  )
}

export default Help
