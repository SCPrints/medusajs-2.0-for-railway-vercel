"use client"

import HowOrderSvgIcon from "@modules/home/components/how-order-svg-icon"
import {
  getHowOrderCustomIcon,
  HOW_ORDER_ANIMATION_BY_ID,
  HOW_ORDER_ICON_IDS,
  type HowOrderCustomIconId,
} from "@modules/home/lib/how-order-custom-icons"

const STEP_LABEL_BY_ID: Record<HowOrderCustomIconId, string> = {
  select_product: "Select your product",
  choose_colours_sizes: "Choose colours & sizes",
  upload_design: "Upload your design",
  print_embroider_prove: "We print, embroider & prove it",
  order_delivered: "Your order is delivered",
  pickup_lansvale: "Or pick up from Lansvale",
}

type Props = {
  title?: string
}

export default function HowOrderWorksSection({
  title = "How to order custom apparel online",
}: Props) {
  return (
    <section
      className="border-t border-ui-border-base bg-ui-bg-subtle py-12 small:py-16"
      aria-labelledby="how-order-works-heading"
    >
      <div className="content-container">
        <h2
          id="how-order-works-heading"
          className="mx-auto max-w-3xl text-center text-xl font-semibold small:text-2xl"
        >
          {title}
        </h2>
        <ol className="mt-10 list-none space-y-8 p-0 small:grid small:grid-cols-2 small:gap-x-4 small:gap-y-10 small:space-y-0 large:grid-cols-3 xl:grid-cols-6">
          {HOW_ORDER_ICON_IDS.map((id) => {
            const icon = getHowOrderCustomIcon(id)
            const label = STEP_LABEL_BY_ID[id]
            const variant = HOW_ORDER_ANIMATION_BY_ID[id]
            return (
              <li key={id} className="flex flex-col items-center text-center">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 text-ui-fg-base"
                  aria-hidden
                >
                  <HowOrderSvgIcon
                    svgContent={icon.svg_content}
                    variant={variant}
                    className="flex-shrink-0"
                  />
                </div>
                <p className="mt-3 max-w-[9.5rem] text-sm font-medium text-ui-fg-base">
                  {label}
                </p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
