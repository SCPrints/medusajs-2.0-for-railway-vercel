import customManifest from "@modules/home/data/custom-apparel-icons.json"

export type HowOrderSvgAnimationVariant =
  | "pulse"
  | "rotate"
  | "bob"
  | "pulse-soft"
  | "slide"
  | "float"

/** Reduced to a clean three-step flow. The icon manifest still ships the legacy
 * IDs; only the ones listed here render in the UI. */
export const HOW_ORDER_ICON_IDS = [
  "select_product",
  "upload_design",
  "order_delivered",
] as const

export type HowOrderCustomIconId = (typeof HOW_ORDER_ICON_IDS)[number]

export const HOW_ORDER_ANIMATION_BY_ID: Record<
  HowOrderCustomIconId,
  HowOrderSvgAnimationVariant
> = {
  select_product: "pulse",
  upload_design: "bob",
  order_delivered: "slide",
}

const iconById = Object.fromEntries(
  customManifest.icons.map((icon) => [icon.id, icon])
) as Record<HowOrderCustomIconId, (typeof customManifest.icons)[number]>

export function getHowOrderCustomIcon(id: HowOrderCustomIconId) {
  const icon = iconById[id]
  if (!icon) {
    throw new Error(`Missing custom apparel icon: ${id}`)
  }
  return icon
}
