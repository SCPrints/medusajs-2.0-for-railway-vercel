"use client"

import repeat from "@lib/util/repeat"
import {
  resolveCartLineDisplayUnitMinor,
  variantWithInferredHandleForLineItem,
} from "@lib/util/cart-line-display-unit"
import { convertMinorToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { Heading, Table, Text } from "@medusajs/ui"

import Item from "@modules/cart/components/item"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import LineItemMockupPreview from "@modules/customizer/components/line-item-mockup-preview"
import {
  getCustomizerMockupArtifacts,
  getCustomizerMockupUrls,
} from "@modules/customizer/lib/metadata"
import { resolveCartLineImageUrl } from "@modules/products/lib/variant-options"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"
import { useMemo, useState } from "react"

type ItemsTemplateProps = {
  items?: HttpTypes.StoreCartLineItem[]
}

type ItemMetadata = Record<string, unknown> | null | undefined

const groupKeyFor = (item: HttpTypes.StoreCartLineItem): string => {
  const metadata = (item as any)?.metadata as ItemMetadata
  // Customizer flow stamps `customizerDesign.group_id` on every line
  // produced by one addCustomizedToCart call (bulk grid: all cells of
  // one design; single add: itself). Prefer this — it's the most
  // reliable signal that two lines "belong together" for editing.
  const customizerDesign = metadata?.customizerDesign as
    | { group_id?: string }
    | undefined
  const customizerGroupId =
    typeof customizerDesign?.group_id === "string"
      ? customizerDesign.group_id
      : null
  if (customizerGroupId) {
    return `design:${customizerGroupId}`
  }
  const designId =
    (metadata?.dtfGangsheetDesignId as string | undefined) ||
    (metadata?.designId as string | undefined) ||
    null
  if (designId) {
    return `design:${designId}`
  }
  return `product:${item.product_id ?? item.variant?.product_id ?? "unknown"}`
}

const groupTitle = (
  item: HttpTypes.StoreCartLineItem,
  groupKey: string
): string => {
  if (groupKey.startsWith("design:")) {
    return `${item.product_title ?? "Custom design"} · custom`
  }
  return item.product_title ?? "Items"
}

const formatCurrencyFromMinor = (
  amountMinor: number | undefined,
  currencyCode: string | undefined
) => {
  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor)) {
    return null
  }
  return convertMinorToLocale({
    amount: amountMinor,
    currency_code: currencyCode || "aud",
  })
}

// Sum the displayed line totals across a cart group. Mirrors
// LineItemPrice's per-line math exactly so the group header total
// always agrees with the sum of the rows beneath it:
//   unit_minor * quantity − adjustments
// Reading `l.subtotal` directly is unreliable — Medusa doesn't always
// hydrate it on cart-line responses (custom add-to-cart paths come
// back with subtotal=0), which is what made the group header show
// "$0" while every row underneath rendered the correct price.
const sumGroupTotalMinor = (
  lines: HttpTypes.StoreCartLineItem[]
): number => {
  let total = 0
  for (const line of lines) {
    const variantForPricing = variantWithInferredHandleForLineItem(line)
    const unitMinor = resolveCartLineDisplayUnitMinor(line, variantForPricing)
    const qty =
      typeof line.quantity === "number" && Number.isFinite(line.quantity)
        ? line.quantity
        : 0
    const adjustmentsSum = (line.adjustments || []).reduce(
      (acc, adjustment) => acc + (adjustment.amount ?? 0),
      0
    )
    total += unitMinor * qty - adjustmentsSum
  }
  return total
}

const ItemsTemplate = ({ items }: ItemsTemplateProps) => {
  const sortedItems = useMemo(() => {
    if (!items) return null
    return [...items].sort((a, b) =>
      (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
    )
  }, [items])

  const groups = useMemo(() => {
    if (!sortedItems) return null
    const order: string[] = []
    const map = new Map<string, HttpTypes.StoreCartLineItem[]>()
    for (const item of sortedItems) {
      const key = groupKeyFor(item)
      if (!map.has(key)) {
        order.push(key)
        map.set(key, [])
      }
      map.get(key)!.push(item)
    }
    return order.map((key) => {
      const lines = map.get(key) ?? []
      const totalQuantity = lines.reduce((sum, l) => sum + (l.quantity ?? 0), 0)
      const totalAmountMinor = sumGroupTotalMinor(lines)
      // Surface the customizer group_id (set by addCustomizedToCart) so
      // the group header can deep-link to /products/<handle>?edit_group=
      // which opens the customizer in group-edit mode (Phase 2). Falls
      // back to null for legacy carts, in which case the header just
      // skips the "Edit design (all colours)" link and the customer
      // edits per-row as before.
      const firstMeta = ((lines[0] as any)?.metadata ?? {}) as Record<
        string,
        unknown
      >
      const customizerGroupId =
        ((firstMeta?.customizerDesign as { group_id?: string } | undefined)
          ?.group_id) ?? null
      const firstHandle =
        ((lines[0] as any)?.variant?.product?.handle as string | undefined) ??
        (typeof firstMeta?.product_handle === "string"
          ? (firstMeta.product_handle as string)
          : null)
      return {
        key,
        lines,
        totalQuantity,
        totalAmountMinor,
        currencyCode: (lines[0] as any)?.currency_code,
        title: groupTitle(lines[0], key),
        isDesignGroup: key.startsWith("design:"),
        editGroupId: customizerGroupId,
        productHandle: firstHandle,
      }
    })
  }, [sortedItems])

  const showGroups = !!groups && groups.length > 0 && groups.length < (items?.length ?? 0)
  // Large-cart heuristic: when the customer is carrying >20 individual lines,
  // collapse every group by default. The grouped rows still show product
  // title + quantity + total — customer expands only the groups they want
  // to edit individual sizes on. Mounts roughly group-count <Item> components
  // instead of total-line-count, which cuts hydration time dramatically on
  // 100+ line carts. (Match the threshold used by CartDropdown's isBulk.)
  const totalLineCount = items?.length ?? 0
  const defaultGroupOpen = totalLineCount <= 20

  return (
    <div>
      <div className="pb-3 flex items-center">
        <Heading className="text-[2rem] leading-[2.75rem]">Cart</Heading>
      </div>
      <Table>
        <Table.Header className="border-t-0">
          <Table.Row className="text-ui-fg-subtle txt-medium-plus">
            <Table.HeaderCell className="!pl-0">Item</Table.HeaderCell>
            <Table.HeaderCell></Table.HeaderCell>
            <Table.HeaderCell>Quantity</Table.HeaderCell>
            <Table.HeaderCell className="hidden small:table-cell">
              Price
            </Table.HeaderCell>
            <Table.HeaderCell className="!pr-0 text-right">
              Total
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {!sortedItems
            ? repeat(5).map((i) => <SkeletonLineItem key={i} />)
            : showGroups
              ? groups!.map((group) => (
                  <CartItemGroup
                    key={group.key}
                    title={group.title}
                    firstLine={group.lines[0]}
                    lineCount={group.lines.length}
                    totalQuantity={group.totalQuantity}
                    totalAmountMinor={group.totalAmountMinor}
                    currencyCode={group.currencyCode}
                    isDesignGroup={group.isDesignGroup}
                    editGroupId={group.editGroupId}
                    productHandle={group.productHandle}
                    defaultOpen={defaultGroupOpen}
                  >
                    {group.lines.map((item) => (
                      <Item key={item.id} item={item} />
                    ))}
                  </CartItemGroup>
                ))
              : sortedItems.map((item) => <Item key={item.id} item={item} />)}
        </Table.Body>
      </Table>
    </div>
  )
}

type CartItemGroupProps = {
  title: string
  /** First line in the group — used to render the design-thumbnail preview
   *  next to the group title so the customer immediately recognises which
   *  design the row collapses on a large cart. */
  firstLine?: HttpTypes.StoreCartLineItem
  lineCount: number
  totalQuantity: number
  /** Sum of `unit_price * qty - adjustments` across every line in the
   *  group, in minor currency units. */
  totalAmountMinor: number
  currencyCode: string | undefined
  isDesignGroup: boolean
  /**
   * Stable design-group id (set by the customizer on bulk-add). When
   * present alongside a product handle, the group header surfaces an
   * "Edit design (all variants)" link that opens the customizer in
   * group-edit mode pre-populated with the existing variant×qty grid.
   * Null for legacy lines or non-customizer groups — those still edit
   * per-row via the line's own "Edit" link.
   */
  editGroupId?: string | null
  productHandle?: string | null
  /** Initial expanded state. Defaults to true for small carts; large carts pass
   *  false so groups render collapsed and individual <Item> rows only mount
   *  when the customer expands a group. */
  defaultOpen?: boolean
  children: React.ReactNode
}

const CartItemGroup = ({
  title,
  firstLine,
  lineCount,
  totalQuantity,
  totalAmountMinor,
  currencyCode,
  isDesignGroup,
  editGroupId,
  productHandle,
  defaultOpen = true,
  children,
}: CartItemGroupProps) => {
  const [open, setOpen] = useState(defaultOpen)
  const formattedTotal = formatCurrencyFromMinor(totalAmountMinor, currencyCode)
  const showGroupEditLink =
    isDesignGroup && lineCount > 1 && !!editGroupId && !!productHandle

  const mockupArtifacts = firstLine ? getCustomizerMockupArtifacts(firstLine) : []
  const mockupUrls = firstLine ? getCustomizerMockupUrls(firstLine) : []
  const fallbackThumb = resolveCartLineImageUrl(firstLine) ?? undefined
  const showThumbnail = isDesignGroup && !!firstLine

  return (
    <>
      <Table.Row className="bg-ui-bg-subtle">
        {/* Medusa UI's Table.Cell prop type doesn't declare `colSpan`, but it forwards rest props to <td>. */}
        <Table.Cell {...({ colSpan: 5 } as any)} className="!py-2">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex flex-1 items-center justify-between gap-3 text-left"
              aria-expanded={open}
              data-testid="cart-group-toggle"
            >
              <div className="flex items-center gap-3 min-w-0">
                {showThumbnail ? (
                  <div className="shrink-0 w-12 h-12 rounded overflow-hidden bg-ui-bg-base ring-1 ring-ui-border-base">
                    <LineItemMockupPreview
                      mockups={mockupArtifacts}
                      mockupUrls={mockupUrls}
                      productThumbnail={fallbackThumb}
                      size="square"
                    />
                  </div>
                ) : null}
                <Text className="txt-medium-plus text-ui-fg-base truncate">
                  {open ? "▾" : "▸"} {title}{" "}
                  {isDesignGroup ? (
                    <span className="ml-1 inline-block rounded-full bg-ui-bg-base px-2 py-0.5 text-xs text-ui-fg-subtle">
                      custom design
                    </span>
                  ) : null}
                </Text>
              </div>
              <Text className="txt-small text-ui-fg-subtle shrink-0">
                {lineCount} {lineCount === 1 ? "variant" : "variants"} ·{" "}
                {totalQuantity} units
                {formattedTotal ? ` · ${formattedTotal}` : ""}
              </Text>
            </button>
            {showGroupEditLink ? (
              <LocalizedClientLink
                href={`/products/${productHandle}?edit_group=${editGroupId}`}
                className="shrink-0 rounded-md bg-[var(--brand-primary,#e11d48)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm ring-1 ring-rose-400/40 transition-colors hover:bg-[var(--brand-primary-hover,#be123c)]"
                data-testid="cart-group-edit-design"
              >
                ✏️ Edit design
              </LocalizedClientLink>
            ) : null}
          </div>
        </Table.Cell>
      </Table.Row>
      {open ? children : null}
    </>
  )
}

export default ItemsTemplate
