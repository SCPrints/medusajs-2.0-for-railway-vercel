"use client"

import { HOW_ORDER_LORDICON_URLS } from "@modules/home/components/home-lordicon-urls"
import LordiconDecorativeIcon from "@modules/home/components/lordicon-decorative-icon"
import {
  ColoursTeesIcon,
  DeliveryBoxIcon,
  MagicTeeIcon,
  PickupIcon,
  ProductTeeIcon,
  UploadDesignTeeIcon,
} from "@modules/home/components/order-process-icons"

const STEPS = [
  {
    label: "Select your product",
    lordiconUrl: HOW_ORDER_LORDICON_URLS[0],
    FallbackIcon: ProductTeeIcon,
  },
  {
    label: "Choose colours & sizes",
    lordiconUrl: HOW_ORDER_LORDICON_URLS[1],
    FallbackIcon: ColoursTeesIcon,
  },
  {
    label: "Upload your design",
    lordiconUrl: HOW_ORDER_LORDICON_URLS[2],
    FallbackIcon: UploadDesignTeeIcon,
  },
  {
    label: "We print, embroider & prove it",
    lordiconUrl: HOW_ORDER_LORDICON_URLS[3],
    FallbackIcon: MagicTeeIcon,
  },
  {
    label: "Your order is delivered",
    lordiconUrl: HOW_ORDER_LORDICON_URLS[4],
    FallbackIcon: DeliveryBoxIcon,
  },
  {
    label: "Or pick up from Lansvale",
    lordiconUrl: HOW_ORDER_LORDICON_URLS[5],
    FallbackIcon: PickupIcon,
  },
] as const

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
          {STEPS.map((step) => (
            <li
              key={step.label}
              className="flex flex-col items-center text-center"
            >
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 text-ui-fg-base"
                aria-hidden
              >
                <LordiconDecorativeIcon
                  lordiconJsonUrl={step.lordiconUrl}
                  size={56}
                  className="flex items-center justify-center"
                  FallbackIcon={step.FallbackIcon}
                  fallbackClassName="h-7 w-7"
                />
              </div>
              <p className="mt-3 max-w-[9.5rem] text-sm font-medium text-ui-fg-base">
                {step.label}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
