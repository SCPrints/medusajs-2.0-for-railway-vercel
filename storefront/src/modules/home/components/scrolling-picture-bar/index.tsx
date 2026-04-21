import LocalizedClientLink from "@modules/common/components/localized-client-link"

type BrandImageLink = {
  name: string
  href: string
  imageSrc: string
  imageAlt: string
}

const brandImageLinks: BrandImageLink[] = [
  {
    name: "AS Colour",
    href: "/store?brand=AS%20Colour",
    imageSrc:
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "AS Colour apparel range",
  },
  {
    name: "Syzmik",
    href: "/store?brand=Syzmik",
    imageSrc:
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "Syzmik workwear collection",
  },
  {
    name: "Biz Collection",
    href: "/store?brand=Biz%20Collection",
    imageSrc:
      "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "Biz Collection uniforms and apparel",
  },
]

const ScrollingPictureBar = () => {
  const scrollingImages = [...brandImageLinks, ...brandImageLinks]

  return (
    <section className="w-full bg-ui-bg-base py-8 small:py-10">
      <div className="content-container mb-4 small:mb-6">
        <div className="border-l-4 border-[var(--brand-secondary)] pl-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
            Shop by brand
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-ui-fg-base">
            Pick a brand to view matching products
          </h2>
        </div>
      </div>
      <div
        className="relative w-full overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
        }}
      >
        <div className="scrolling-picture-track flex w-max gap-8 py-1 motion-reduce:!animate-none">
          {scrollingImages.map((brandImage, index) => (
            <LocalizedClientLink
              key={`${brandImage.name}-${index}`}
              href={brandImage.href}
              className="group relative h-[38vh] w-[84vw] shrink-0 overflow-hidden rounded-2xl border border-ui-border-base shadow-elevation-card-rest transition-all hover:border-[var(--brand-secondary)]/60 small:h-[48vh] small:w-[72vw]"
            >
              <img
                src={brandImage.imageSrc}
                alt={brandImage.imageAlt}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
              <div className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-white/25 bg-black/45 px-3 py-2 backdrop-blur-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-white small:text-base">
                  {brandImage.name}
                </p>
                <p className="text-xs text-white/80">View products</p>
              </div>
            </LocalizedClientLink>
          ))}
        </div>
      </div>
    </section>
  )
}

export default ScrollingPictureBar
