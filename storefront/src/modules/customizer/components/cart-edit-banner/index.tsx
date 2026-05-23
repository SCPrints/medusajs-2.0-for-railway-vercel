"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"

import { retrieveCart } from "@lib/data/cart"

type GroupSummary = {
  lineCount: number
  totalQuantity: number
} | null

/**
 * Full-width sticky amber bar that pins to the top of the page
 * whenever the customizer is opened with `?edit_group=<id>` (the
 * "Edit design" link on a cart row). The wizard-sidebar banner is
 * easy to miss when the customer is focused on the canvas; this one
 * sits ABOVE every tab and panel so the EDITING state is always
 * obvious — eliminating the "wait am I adding to cart again?"
 * confusion that came up in feedback.
 *
 * Renders nothing on PDPs that aren't in edit mode (the common case).
 */
export default function CartEditBanner() {
  const params = useParams() as { countryCode?: string }
  const router = useRouter()
  const searchParams = useSearchParams()
  const editGroupId = searchParams?.get("edit_group") ?? null
  const editLineItemId = searchParams?.get("edit") ?? null
  const isEditing = !!editGroupId || !!editLineItemId

  const [summary, setSummary] = useState<GroupSummary>(null)

  useEffect(() => {
    if (!isEditing) return
    let cancelled = false
    void retrieveCart()
      .then((cart) => {
        if (cancelled || !cart?.items?.length) return
        const matches = cart.items.filter((line: any) => {
          if (editLineItemId && line?.id === editLineItemId) return true
          if (editGroupId) {
            const meta = (line?.metadata ?? {}) as Record<string, unknown>
            const design = meta?.customizerDesign as
              | { group_id?: string }
              | undefined
            return design?.group_id === editGroupId
          }
          return false
        })
        if (matches.length === 0) return
        setSummary({
          lineCount: matches.length,
          totalQuantity: matches.reduce(
            (sum: number, line: any) => sum + (line?.quantity ?? 0),
            0
          ),
        })
      })
      .catch(() => {
        // Best-effort — if the cart fetch fails, the bar still renders
        // with generic copy. Worth showing even without numbers.
      })
    return () => {
      cancelled = true
    }
  }, [editGroupId, editLineItemId, isEditing])

  if (!isEditing) return null

  const countryCode = params?.countryCode ?? "au"
  const isGroup = !!editGroupId

  return (
    <div
      className="sticky top-0 z-40 border-b-2 border-amber-500 bg-amber-100 text-amber-900 shadow-md"
      role="status"
      data-testid="cart-edit-banner"
    >
      <div className="content-container flex flex-wrap items-center justify-between gap-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="text-base">✏️</span>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight">
              {isGroup ? "Editing your cart design" : "Editing cart item"}
            </p>
            <p className="text-xs leading-snug text-amber-800">
              {summary ? (
                <>
                  Changes will replace{" "}
                  <span className="font-semibold">
                    {summary.lineCount} cart line
                    {summary.lineCount === 1 ? "" : "s"}
                  </span>
                  {summary.totalQuantity > 0
                    ? ` (${summary.totalQuantity} garments)`
                    : ""}
                  . No new items will be added.
                </>
              ) : (
                "Adjust the design — your existing cart items will be updated when you save, not added to."
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            router.push(`/${countryCode}/cart`)
          }}
          className="shrink-0 rounded-md border border-amber-700 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-50"
        >
          Cancel & back to cart
        </button>
      </div>
    </div>
  )
}
