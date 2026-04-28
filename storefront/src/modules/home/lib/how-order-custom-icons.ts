import customManifest from "@modules/home/data/custom-apparel-icons.json"

export type HowOrderSvgAnimationVariant =
  | "pulse"
  | "rotate"
  | "bob"
  | "pulse-soft"
  | "slide"
  | "float"

export const HOW_ORDER_ICON_IDS = [
  "select_product",
  "choose_colours_sizes",
  "upload_design",
  "print_embroider_prove",
  "order_delivered",
  "pickup_lansvale",
] as const

export type HowOrderCustomIconId = (typeof HOW_ORDER_ICON_IDS)[number]

export const HOW_ORDER_ANIMATION_BY_ID: Record<
  HowOrderCustomIconId,
  HowOrderSvgAnimationVariant
> = {
  select_product: "pulse",
  choose_colours_sizes: "rotate",
  upload_design: "bob",
  print_embroider_prove: "pulse-soft",
  order_delivered: "slide",
  pickup_lansvale: "float",
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
