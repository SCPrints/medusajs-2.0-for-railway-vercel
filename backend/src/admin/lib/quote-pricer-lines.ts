/**
 * Job pricer → quote line linkage (pure, unit-tested).
 *
 * `group_id` is what the Studio's design-items route attaches a design to
 * (every line carrying it). A pricer group's lines share the group id, so one
 * Studio design covers every colour. A colour row staff opened in the Studio
 * on its own (`ownDesign`) gets a group of its own, so each colour can carry
 * different artwork (e.g. white ink on black, black ink on white).
 */
export const pricerLineGroupId = (groupId: string, row?: { id: string; ownDesign?: boolean } | null) =>
  row?.ownDesign ? `${groupId}~${row.id}` : groupId

/**
 * The variant a pricer line points at. Customer-supplied garments ride the
 * service line (no variant). An "Any size" quantity still has a colour, so it
 * points at that colour's first variant (`variantFor(colour, "")`): left null,
 * quote → order conversion resolves a product-only line to the product's
 * DEFAULT variant and the order line lands on the wrong colour.
 */
export function pricerLineVariant<V>(args: {
  supplied: boolean
  colour: string | null
  size: string
  variantFor: ((colour: string | null, size: string) => V | null) | null
}): V | null {
  if (args.supplied || !args.variantFor) return null
  return args.variantFor(args.colour, args.size)
}
