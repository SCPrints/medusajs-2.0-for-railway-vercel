/**
 * Dark-garment heuristic from a colour name. Dark garments need a white
 * underbase screen, which costs a colour slot. Mirrored in the storefront
 * (storefront/src/modules/customizer/lib/estimate-screen-colours.ts) — keep
 * the two regexes identical.
 *
 * Lives in its own module (no pricing imports) so the cart pricing path can
 * derive the flag from the variant colour without importing quote-pricing.
 */
const DARK_COLOUR_RE =
  /\b(black|navy|charcoal|graphite|coal|ink|midnight|dark|forest|bottle|emerald|kelly|army|olive|khaki green|maroon|burgundy|wine|plum|purple|royal|cobalt|denim|indigo|brown|chocolate|espresso|red|green|blue|teal|petrol|slate|steel|gunmetal|storm|granite)\b/i
const LIGHT_COLOUR_RE =
  /\b(white|natural|cream|ecru|ivory|bone|sand|beige|stone|ash|silver|grey marle|gray marle|light|pale|pastel|lemon|pink|sky|mint|lilac|peach|butter|oat|vanilla|arctic|snow)\b/i

export function isDarkGarmentColourName(name: string | null | undefined): boolean {
  if (!name) return false
  if (LIGHT_COLOUR_RE.test(name)) return false
  return DARK_COLOUR_RE.test(name)
}

const isColourOptionTitle = (title: unknown): boolean =>
  typeof title === "string" && /colou?r/i.test(title)

/**
 * The colour name of a variant as the catalog states it: the value of its
 * "Colour"/"Color" option, else the variant title ("Black / M"). Null when
 * neither is available.
 */
export function variantColourName(variant: {
  title?: string | null
  options?: Array<{ value?: string | null; option?: { title?: string | null } | null }> | null
}): string | null {
  const opt = (variant.options ?? []).find((o) => isColourOptionTitle(o?.option?.title))
  if (opt?.value) return opt.value
  return variant.title ?? null
}
