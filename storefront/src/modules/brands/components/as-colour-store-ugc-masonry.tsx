import Image from "next/image"

const BASE = "/images/brands/as-colour/ugc"

/** Column-biased masonry: mixed aspect wrappers so the cascade reads like a staggered IG grid. */
const TILES: { src: string; frameClass: string; alt: string }[] = [
  { src: `${BASE}/ugc-1.png`, frameClass: "aspect-[3/4]", alt: "" },
  { src: `${BASE}/ugc-2.png`, frameClass: "aspect-[4/3]", alt: "" },
  { src: `${BASE}/ugc-3.png`, frameClass: "aspect-[5/4]", alt: "" },
  { src: `${BASE}/ugc-4.png`, frameClass: "aspect-square", alt: "" },
  { src: `${BASE}/ugc-5.png`, frameClass: "aspect-[3/5]", alt: "" },
  { src: `${BASE}/ugc-6.png`, frameClass: "aspect-[4/5]", alt: "" },
]

/**
 * Decorative UGC-style photo strip for the AS Colour catalog view.
 * Uses CSS columns (column-biased flow) plus `break-inside-avoid` for stable tiles.
 */
export default function AsColourStoreUgcMasonry() {
  return (
    <section
      className="mb-10 rounded-xl border border-ui-border-base/70 bg-gradient-to-b from-ui-bg-base to-ui-bg-subtle/80 p-3 sm:p-4"
      aria-label="Community and lifestyle imagery"
    >
      <p className="mb-4 text-small-regular uppercase tracking-[0.2em] text-ui-fg-muted">
        In the studio
      </p>
      <div className="columns-2 gap-3 md:columns-3 md:gap-4">
        {TILES.map(({ src, frameClass, alt }) => (
          <div key={src} className={`relative mb-3 w-full overflow-hidden rounded-lg bg-neutral-950 break-inside-avoid ${frameClass}`}>
            <Image
              src={src}
              alt={alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 42vw, 28vw"
            />
          </div>
        ))}
      </div>
    </section>
  )
}
