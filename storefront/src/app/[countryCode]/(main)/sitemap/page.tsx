import { Metadata } from "next"
import { getCollectionsList } from "@lib/data/collections"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MarketingHero from "@modules/common/components/marketing-hero"
import { services } from "@modules/services/data"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/sitemap`
  const description =
    "Browse a structured list of key pages, services, and collections on the SC PRINTS store."

  return {
    title: "Site map",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Site map | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
    twitter: {
      title: `Site map | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

type LinkGroup = {
  title: string
  items: { href: string; label: string }[]
}

const STATIC_GROUPS: LinkGroup[] = [
  {
    title: "Shop and discover",
    items: [
      { href: "/", label: "Home" },
      { href: "/store", label: "Store" },
      { href: "/explore", label: "Explore" },
      { href: "/brands", label: "Brands" },
      { href: "/search", label: "Search" },
      { href: "/customizer", label: "Logo customizer" },
      { href: "/dtf-builder", label: "DTF builder" },
    ],
  },
  {
    title: "Account and help",
    items: [
      { href: "/account", label: "Account" },
      { href: "/cart", label: "Cart" },
      { href: "/contact", label: "Contact" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Policies",
    items: [
      { href: "/shipping-policy", label: "Shipping policy" },
      { href: "/returns-policy", label: "Returns policy" },
      { href: "/privacy-policy", label: "Privacy policy" },
    ],
  },
]

export default async function SitemapPage() {
  const { collections } = await getCollectionsList(0, 100)
  const sortedCollections = [...collections].sort((a, b) =>
    (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" })
  )

  return (
    <div className="content-container py-14 small:py-20">
      <MarketingHero
        eyebrow="Navigation"
        title="Site map"
        subtitle="Jump to the main areas of the store, services, policies, and product collections."
      />

      <div className="mt-10 grid gap-8 large:grid-cols-2">
        {STATIC_GROUPS.map((group) => (
          <section
            key={group.title}
            className="rounded-2xl border border-ui-border-base bg-white p-6 small:p-8"
          >
            <h2 className="text-lg font-semibold text-ui-fg-base">{group.title}</h2>
            <ul className="mt-4 grid gap-2 text-sm text-ui-fg-subtle">
              {group.items.map((item) => (
                <li key={item.href}>
                  <LocalizedClientLink
                    href={item.href}
                    className="text-ui-fg-subtle transition hover:text-ui-fg-base"
                  >
                    {item.label}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="rounded-2xl border border-ui-border-base bg-white p-6 small:p-8 large:col-span-2">
          <h2 className="text-lg font-semibold text-ui-fg-base">Services</h2>
          <p className="mt-2 text-sm text-ui-fg-muted">
            Decoration and production services with dedicated detail pages.
          </p>
          <ul className="mt-4 grid gap-2 small:grid-cols-2 text-sm text-ui-fg-subtle">
            <li>
              <LocalizedClientLink
                href="/services"
                className="text-ui-fg-subtle transition hover:text-ui-fg-base"
              >
                All services
              </LocalizedClientLink>
            </li>
            {services.map((s) => (
              <li key={s.slug}>
                <LocalizedClientLink
                  href={`/services/${s.slug}`}
                  className="text-ui-fg-subtle transition hover:text-ui-fg-base"
                >
                  {s.title}
                </LocalizedClientLink>
              </li>
            ))}
          </ul>
        </section>

        {sortedCollections.length > 0 && (
          <section className="rounded-2xl border border-ui-border-base bg-white p-6 small:p-8 large:col-span-2">
            <h2 className="text-lg font-semibold text-ui-fg-base">Collections</h2>
            <p className="mt-2 text-sm text-ui-fg-muted">
              Browsable product groupings; individual products also appear under Store and
              collection pages.
            </p>
            <ul className="mt-4 grid gap-2 small:grid-cols-2 large:grid-cols-3 text-sm text-ui-fg-subtle">
              {sortedCollections.map((c) => (
                <li key={c.id}>
                  <LocalizedClientLink
                    href={`/collections/${c.handle}`}
                    className="text-ui-fg-subtle transition hover:text-ui-fg-base"
                  >
                    {c.title}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
