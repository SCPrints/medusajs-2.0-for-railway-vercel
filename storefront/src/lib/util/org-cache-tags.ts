/**
 * Per-organisation Next.js cache tags. The backend writes the same
 * tag keys when it mutates the underlying data so the storefront can
 * invalidate downstream pages without a per-request DB hit.
 *
 * Mirrors the pattern in /api/revalidate-products → revalidateTag.
 * Receiving endpoint: /api/revalidate-org (POST).
 */

export const ORG_DETAIL_TAG = (orgId: string) => `org:${orgId}:detail`
export const ORG_DESIGNS_TAG = (orgId: string) => `org:${orgId}:designs`
export const ORG_DESTINATIONS_TAG = (orgId: string) => `org:${orgId}:destinations`
export const ORG_INVENTORY_TAG = (orgId: string) => `org:${orgId}:inventory`
export const ORG_ORDERS_TAG = (orgId: string) => `org:${orgId}:orders`
export const ORG_MEMBERS_TAG = (orgId: string) => `org:${orgId}:members`

export const ALL_ORG_TAGS_FOR = (orgId: string): string[] => [
  ORG_DETAIL_TAG(orgId),
  ORG_DESIGNS_TAG(orgId),
  ORG_DESTINATIONS_TAG(orgId),
  ORG_INVENTORY_TAG(orgId),
  ORG_ORDERS_TAG(orgId),
  ORG_MEMBERS_TAG(orgId),
]
