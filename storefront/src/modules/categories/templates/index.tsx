import { notFound } from "next/navigation"
import { Suspense } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { ProductFilters } from "@modules/store/components/refinement-list/types"
import PaginatedProducts from "@modules/store/templates/paginated-products"
import { HttpTypes } from "@medusajs/types"
import { buildAbsoluteUrl } from "@lib/util/seo"
import { safeJsonLd } from "@lib/util/json-ld"

export default function CategoryTemplate({
  categories,
  sortBy,
  page,
  minPrice,
  maxPrice,
  inStock,
  brand,
  fabric,
  countryCode,
}: {
  categories: HttpTypes.StoreProductCategory[]
  sortBy?: SortOptions
  page?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  brand?: string
  fabric?: string
  countryCode: string
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  const category = categories[categories.length - 1]
  const parents = categories.slice(0, categories.length - 1)
  const children = (category?.category_children ?? []).filter(
    // Filter inactive children defensively. The Medusa Store API may surface
    // them via the embedded category_children array even when the parent
    // request scoped to active. Inactive = orphan from a TREE refactor (see
    // backend cleanup-orphan-shop-categories.ts) and shouldn't render.
    (c) =>
      c?.handle &&
      c?.name &&
      (c as { is_active?: boolean | null })?.is_active !== false
  )

  // Related-categories navigation: when landing on a parent (e.g. /categories/mens)
  // show its children; when landing on a leaf (e.g. /categories/mens/t-shirts) show
  // sibling sub-categories so the customer can hop between drill-downs without
  // walking back up. Two-level tree assumption — for deeper hierarchies the base
  // path needs to include every ancestor handle.
  const parentLeaf = parents[parents.length - 1]
  const siblings = parentLeaf
    ? (
        (parentLeaf.category_children ??
          []) as HttpTypes.StoreProductCategory[]
      ).filter(
        (c) =>
          c?.handle &&
          c?.name &&
          c.id !== category?.id &&
          (c as { is_active?: boolean | null })?.is_active !== false
      )
    : []
  const relatedItems = children.length > 0 ? children : siblings
  const relatedBasePath =
    children.length > 0
      ? `/categories/${category?.handle}`
      : parentLeaf
        ? `/categories/${parentLeaf.handle}`
        : ""
  const relatedLabel =
    children.length === 0 && parentLeaf ? `More in ${parentLeaf.name}` : null

  if (!category || !countryCode) notFound()

  // BreadcrumbList structured data: Home → audience → leaf. Uses the URL
  // ancestor chain when present (multi-segment paths), else the leaf's
  // parent_category (single-segment handles like `mens-polos`).
  const parentCategory = (
    category as {
      parent_category?: { name?: string | null; handle?: string | null } | null
    }
  ).parent_category
  const crumbChain: HttpTypes.StoreProductCategory[] =
    parents.length > 0
      ? parents
      : parentCategory?.name && parentCategory?.handle
        ? [parentCategory as HttpTypes.StoreProductCategory]
        : []
  const breadcrumbItems = [
    { name: "Home", path: `/${countryCode}` },
    ...crumbChain
      .filter((c) => c?.name && c?.handle)
      .map((c) => ({
        name: c.name,
        path: `/${countryCode}/categories/${c.handle}`,
      })),
    {
      name: category.name,
      path: `/${countryCode}/categories/${category.handle}`,
    },
  ]
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: b.name,
      item: buildAbsoluteUrl(b.path),
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <section
        className="content-container border-b border-ui-border-base py-10 small:py-14"
        data-testid="category-hero"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ui-fg-muted">
          {parents.length > 0 ? (
            <>
              {parents.map((parent, idx) => (
                <span key={parent.id}>
                  <LocalizedClientLink
                    href={`/categories/${parent.handle}`}
                    className="hover:text-ui-fg-base"
                  >
                    {parent.name}
                  </LocalizedClientLink>
                  {idx < parents.length - 1 ? (
                    <span aria-hidden> / </span>
                  ) : null}
                </span>
              ))}
            </>
          ) : (
            "Shop by category"
          )}
        </p>
        <h1
          className="mt-2 text-3xl font-semibold tracking-tight text-ui-fg-base small:text-4xl"
          data-testid="category-page-title"
        >
          {category.name}
        </h1>
        {category.description ? (
          <p className="mt-3 max-w-2xl text-base text-ui-fg-subtle small:text-lg">
            {category.description}
          </p>
        ) : null}

        {relatedItems.length > 0 ? (
          <div className="mt-6">
            {relatedLabel ? (
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-ui-fg-muted">
                {relatedLabel}
              </p>
            ) : null}
            <ul className="flex flex-wrap gap-2">
              {relatedItems.map((c) => (
                <li key={c.id}>
                  <LocalizedClientLink
                    href={`${relatedBasePath}/${c.handle}`}
                    className="rounded-full border border-ui-border-base bg-ui-bg-subtle px-3 py-1 text-small-regular text-ui-fg-base hover:bg-ui-bg-subtle-hover"
                    data-testid={`category-related-${c.handle}-link`}
                  >
                    {c.name}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div
        className="content-container flex flex-col small:flex-row small:items-start small:gap-x-10 py-6"
        data-testid="category-container"
      >
        <RefinementList
          sortBy={sort}
          filters={
            {
              minPrice,
              maxPrice,
              inStock,
              brand,
              fabric,
            } as ProductFilters
          }
          data-testid="sort-by-container"
        />
        <div className="w-full">
          {/* key on every result-affecting param so the skeleton shows
              immediately on sort/filter/page change instead of leaving the
              previous grid on screen during the soft navigation. */}
          <Suspense
            key={`${sort}:${pageNumber}:${minPrice ?? ""}:${maxPrice ?? ""}:${inStock ?? ""}:${brand ?? ""}:${fabric ?? ""}`}
            fallback={<SkeletonProductGrid />}
          >
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              // Parent + child category ids: products are only ever ASSIGNED
              // to leaf categories (`mens-t-shirts`), never the audience
              // parent (`mens`) — see resolveCategoryHandles in
              // backend/src/lib/shop-categories.ts. Querying just the
              // parent's id rendered audience landing pages with an EMPTY
              // grid. Including the (already-fetched) children makes parent
              // pages list their whole subtree. NOTE: the warm-cache route
              // mirrors this construction — keep them in sync.
              categoryIds={[category.id, ...children.map((c) => c.id)]}
              minPrice={minPrice}
              maxPrice={maxPrice}
              inStock={inStock}
              brand={brand}
              fabric={fabric}
              countryCode={countryCode}
            />
          </Suspense>
        </div>
      </div>
    </>
  )
}
