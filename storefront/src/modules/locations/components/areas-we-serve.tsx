import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { locations } from "@modules/locations/data/locations"

type Props = {
  /** Heading text; pass null to render the link list only. */
  heading?: string | null
  /** Optional lead-in sentence under the heading. */
  intro?: string | null
  className?: string
}

/**
 * Links to every suburb landing page. Rendered in the footer (site-wide) and
 * on each service page so the location pages are reachable from real
 * content, not just the sitemap — Search Console showed them orphaned
 * (2026-09-14) and the un-touched suburbs sliding for it.
 */
export default function AreasWeServe({
  heading = "Areas we serve",
  intro = null,
  className = "",
}: Props) {
  return (
    <div className={className}>
      {heading ? <h2 className="txt-small-plus text-ui-fg-base">{heading}</h2> : null}
      {intro ? <p className="mt-2 text-sm text-ui-fg-subtle">{intro}</p> : null}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-ui-fg-subtle txt-small">
        {locations.map((l) => (
          <li key={l.slug}>
            <LocalizedClientLink
              href={`/locations/${l.slug}`}
              className="hover:text-ui-fg-base"
            >
              {l.suburb}
            </LocalizedClientLink>
          </li>
        ))}
        <li>
          <LocalizedClientLink href="/locations" className="hover:text-ui-fg-base">
            All areas →
          </LocalizedClientLink>
        </li>
      </ul>
    </div>
  )
}
