import { HttpTypes } from "@medusajs/types"

export type SizeGuideMetadata = {
  images?: string[]
  tips?: string[]
}

/**
 * Parse `product.metadata.size_guide` — { images: string[], tips: string[] }.
 * Stamped per product (Shaka Wear first, via stamp-shaka-size-guides.ts);
 * any supplier can adopt the same shape. Returns null when absent/malformed
 * so the PDP renders nothing rather than an empty section.
 */
export function getSizeGuide(
  product: HttpTypes.StoreProduct
): SizeGuideMetadata | null {
  const raw = (product.metadata as Record<string, unknown> | null)?.size_guide
  if (!raw || typeof raw !== "object") return null
  const images = Array.isArray((raw as SizeGuideMetadata).images)
    ? (raw as SizeGuideMetadata).images!.filter(
        (u): u is string => typeof u === "string" && u.startsWith("https://")
      )
    : []
  const tips = Array.isArray((raw as SizeGuideMetadata).tips)
    ? (raw as SizeGuideMetadata).tips!.filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0
      )
    : []
  if (!images.length && !tips.length) return null
  return { images, tips }
}

/**
 * "Size & fit" section for the PDP info column. Native <details> so it ships
 * zero JS and stays collapsed until the shopper asks — charts are tall images.
 */
const SizeGuide = ({ product }: { product: HttpTypes.StoreProduct }) => {
  const guide = getSizeGuide(product)
  if (!guide) return null

  return (
    <details
      className="group max-w-3xl rounded-lg border border-ui-border-base"
      data-testid="size-guide"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-ui-fg-base [&::-webkit-details-marker]:hidden">
        Size &amp; fit guide
        <span
          aria-hidden
          className="text-ui-fg-muted transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-ui-border-base px-4 py-4">
        {guide.tips!.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-ui-fg-subtle">
            {guide.tips!.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        ) : null}
        {guide.images!.map((url) => (
          // ponytail: plain lazy <img> — charts live inside a collapsed
          // <details>, so next/image sizing buys nothing here
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={`${product.title} size chart`}
            loading="lazy"
            className="w-full rounded-md"
          />
        ))}
      </div>
    </details>
  )
}

export default SizeGuide
