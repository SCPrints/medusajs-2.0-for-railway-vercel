import servicesManifest from "@modules/home/data/services-offered-icons.json"

import type { HowOrderSvgAnimationVariant } from "@modules/home/lib/how-order-custom-icons"

export const SERVICES_OFFERED_ICON_IDS = [
  "screen_print",
  "digital_transfer",
  "embroidery",
  "neck_tags",
  "fold_bag",
  "warehousing_fulfillment",
  "uv_printing",
  "design",
] as const

export type ServicesOfferedIconId = (typeof SERVICES_OFFERED_ICON_IDS)[number]

export const SERVICES_OFFERED_ANIMATION_BY_ID: Record<
  ServicesOfferedIconId,
  HowOrderSvgAnimationVariant
> = {
  screen_print: "pulse-soft",
  digital_transfer: "slide",
  embroidery: "bob",
  neck_tags: "rotate",
  fold_bag: "pulse",
  warehousing_fulfillment: "float",
  uv_printing: "pulse-soft",
  design: "rotate",
}

const iconById = Object.fromEntries(
  servicesManifest.icons.map((icon) => [icon.id, icon])
) as Record<ServicesOfferedIconId, (typeof servicesManifest.icons)[number]>

export function getServicesOfferedIcon(id: ServicesOfferedIconId) {
  const icon = iconById[id]
  if (!icon) {
    throw new Error(`Missing services offered icon: ${id}`)
  }
  return icon
}
