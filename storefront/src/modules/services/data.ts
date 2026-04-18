export type ServiceItem = {
  slug: string
  title: string
  shortDescription: string
  heroDescription: string
  bulletPoints: string[]
}

export const services: ServiceItem[] = [
  {
    slug: "screen-printing",
    title: "Screen Printing",
    shortDescription: "Durable, vibrant prints ideal for uniforms, events, and high-volume runs.",
    heroDescription:
      "Screen printing is our go-to process for bold, long-lasting prints with consistent color and finish across large quantities.",
    bulletPoints: [
      "Best value on medium-to-large order volumes",
      "Strong opacity and wash durability",
      "Great for uniforms, merch, and promotional runs",
      "Pantone-matched inks available",
    ],
  },
  {
    slug: "embroidery",
    title: "Embroidery",
    shortDescription: "Premium stitched branding for polos, caps, jackets, and workwear.",
    heroDescription:
      "Embroidery gives your logo a premium, textured finish that performs exceptionally well on workwear and corporate garments.",
    bulletPoints: [
      "Professional and long-lasting finish",
      "Ideal for uniforms, hospitality, and corporate apparel",
      "Suitable for caps, polos, jackets, and heavier fabrics",
      "Digitising support available for artwork setup",
    ],
  },
  {
    slug: "digital-transfers",
    title: "Digital Transfers",
    shortDescription: "Flexible, full-color graphics with fine detail and quick turnaround.",
    heroDescription:
      "Digital transfers are perfect for full-color artwork, variable designs, and low-to-mid quantity runs where flexibility matters.",
    bulletPoints: [
      "Excellent for full-color logos and gradients",
      "Fast setup for urgent jobs",
      "Great option for variable names and numbers",
      "Applies cleanly across a wide range of garment types",
    ],
  },
  {
    slug: "uv-printing",
    title: "UV Printing",
    shortDescription: "Direct-to-surface branding for hard goods, signage, and specialty items.",
    heroDescription:
      "UV printing enables sharp, high-impact prints on rigid materials and promotional products beyond textiles.",
    bulletPoints: [
      "Ideal for signage, promotional products, and hard surfaces",
      "High-resolution output with crisp detail",
      "Fast curing and durable finish",
      "Great for custom runs and branded collateral",
    ],
  },
]

export const getServiceBySlug = (slug: string) =>
  services.find((service) => service.slug === slug)
