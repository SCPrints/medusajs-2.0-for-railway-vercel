import { getCollectionsList } from "@lib/data/collections"
import { getInstagramProfileUrl } from "@lib/data/instagram"
import { Text, clx } from "@medusajs/ui"
import Image from "next/image"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import NewsletterSignup from "./newsletter-signup"

export default async function Footer() {
  const { collections } = await getCollectionsList(0, 6)
  const instagramUrl = getInstagramProfileUrl()

  return (
    <footer className="border-t border-ui-border-base w-full">
      <div className="content-container flex flex-col w-full">
        <div className="grid gap-10 py-16 small:grid-cols-2 large:grid-cols-4">
          <div className="space-y-4">
            <LocalizedClientLink
              href="/"
              className="inline-flex items-center rounded-lg bg-ui-fg-base px-3 py-2"
            >
              <Image
                src="/branding/sc-prints-logo-transparent.png"
                alt="SC Prints"
                width={158}
                height={52}
                className="h-10 w-auto"
              />
            </LocalizedClientLink>
            <p className="text-small-regular text-ui-fg-subtle max-w-[22rem]">
              Premium decorated apparel and merchandise for teams, brands, and events across
              Australia.
            </p>
            <div className="flex gap-3">
              <a
                href={instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="text-small-semi text-ui-fg-subtle hover:text-ui-fg-base"
              >
                Instagram
              </a>
            </div>
          </div>

          <div className="text-small-regular">
            <span className="txt-small-plus txt-ui-fg-base">Quick Links</span>
            <ul className="mt-3 grid gap-y-2 text-ui-fg-subtle txt-small">
              <li>
                <LocalizedClientLink href="/" className="hover:text-ui-fg-base">
                  Home
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/store" className="hover:text-ui-fg-base">
                  Store
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/customizer" className="hover:text-ui-fg-base">
                  Logo Customizer
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/brands" className="hover:text-ui-fg-base">
                  Brands
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/contact" className="hover:text-ui-fg-base">
                  Contact Us
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/search" className="hover:text-ui-fg-base">
                  Search
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/sitemap" className="hover:text-ui-fg-base">
                  Site map
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/account" className="hover:text-ui-fg-base">
                  Account
                </LocalizedClientLink>
              </li>
            </ul>
          </div>

          <div className="text-small-regular">
            <span className="txt-small-plus txt-ui-fg-base">Policies</span>
            <ul className="mt-3 grid gap-y-2 text-ui-fg-subtle txt-small">
              <li>
                <LocalizedClientLink href="/shipping-policy" className="hover:text-ui-fg-base">
                  Shipping Policy
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/returns-policy" className="hover:text-ui-fg-base">
                  Returns Policy
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/privacy-policy" className="hover:text-ui-fg-base">
                  Privacy Policy
                </LocalizedClientLink>
              </li>
            </ul>
          </div>

          <div className="text-small-regular">
            <span className="txt-small-plus txt-ui-fg-base">Newsletter</span>
            <p className="mt-3 text-ui-fg-subtle txt-small">
              Get product updates, promos, and print tips straight to your inbox.
            </p>
            <NewsletterSignup />
          </div>
        </div>

        {collections && collections.length > 0 && (
          <div className="border-t border-ui-border-base py-8">
            <span className="txt-small-plus txt-ui-fg-base">Top Collections</span>
            <ul
              className={clx(
                "mt-3 grid gap-2 text-ui-fg-subtle txt-small grid-cols-2 small:grid-cols-3 large:grid-cols-6"
              )}
            >
              {collections.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <LocalizedClientLink className="hover:text-ui-fg-base" href={`/collections/${c.handle}`}>
                    {c.title}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex w-full mb-8 justify-between text-ui-fg-muted">
          <Text className="txt-compact-small">
            © {new Date().getFullYear()} SC PRINTS. All rights reserved.
          </Text>
        </div>
      </div>
    </footer>
  )
}
