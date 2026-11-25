type Line = { quantity?: number | null; metadata?: Record<string, unknown> | null }

/** Names/numbers and home-delivery postage are charges on a line, not garments. */
export const isChargeLine = (line: Line): boolean =>
  !!line.metadata?.names_numbers || line.metadata?.home_delivery_postage === true

/** Garments in the cart, for "N items" counts. */
export const cartGarmentCount = (items: Line[] | null | undefined): number =>
  (items ?? []).reduce((n, i) => (isChargeLine(i) ? n : n + (i.quantity ?? 0)), 0)
