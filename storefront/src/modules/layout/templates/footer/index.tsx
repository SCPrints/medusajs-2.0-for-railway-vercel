import { getCollectionsList } from "@lib/data/collections"
import { Text, clx } from "@medusajs/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MedusaCTA from "@modules/layout/components/medusa-cta"

export default async function Footer() {
  const { collections } = await getCollectionsList(0, 6)

  return (
    <footer className="border-t border-ui-border-base w-full">
      <div className="content-container flex flex-col w-full">
        <div className="flex flex-col gap-y-6 xsmall:flex-row items-start justify-between py-40">
          <div>
            <LocalizedClientLink
              href="/"
              className="txt-compact-xlarge-plus text-ui-fg-subtle hover:text-ui-fg-base uppercase"
            >
              SC PRINTS
            </LocalizedClientLink>
          </div>
          <div className="text-small-regular gap-10 md:gap-x-16 grid grid-cols-2 sm:grid-cols-3">
            {collections && collections.length > 0 && (
              <div className="flex flex-col gap-y-2">
                <span className="txt-small-plus txt-ui-fg-base">
                  Collections
                </span>
                <ul
                  className={clx(
                    "grid grid-cols-1 gap-2 text-ui-fg-subtle txt-small",
                    {
                      "grid-cols-2": (collections?.length || 0) > 3,
                    }
                  )}
                >
                  {collections?.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <LocalizedClientLink
                        className="hover:text-ui-fg-base"
                        href={`/collections/${c.handle}`}
                      >
                        {c.title}
                      </LocalizedClientLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-y-2">
              <LocalizedClientLink
                href="/"
                className="txt-small-plus txt-ui-fg-base hover:text-ui-fg-base"
              >
                SC PRINTS
              </LocalizedClientLink>
              <ul className="grid grid-cols-1 gap-y-2 text-ui-fg-subtle txt-small">
                <li>
                  <LocalizedClientLink href="/" className="hover:text-ui-fg-base">
                    Home
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/store"
                    className="hover:text-ui-fg-base"
                  >
                    Store
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/contact"
                    className="hover:text-ui-fg-base"
                  >
                    Contact Us
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/search"
                    className="hover:text-ui-fg-base"
                  >
                    Search
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/account"
                    className="hover:text-ui-fg-base"
                  >
                    Account
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink href="/cart" className="hover:text-ui-fg-base">
                    Cart
                  </LocalizedClientLink>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex w-full mb-16 justify-between text-ui-fg-muted">
          <Text className="txt-compact-small">
            © {new Date().getFullYear()} SC PRINTS. All rights reserved.
          </Text>
          <MedusaCTA />
        </div>
      </div>
    </footer>
  )
}
