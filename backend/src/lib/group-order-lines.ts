/**
 * Single-design group orders → priced cart lines.
 *
 * The converter used to add one line per participant with the saved design
 * attached but no price, so decoration was never charged (and per-participant
 * lines would have priced embroidery at the 1-piece tier anyway). Now the
 * roster is aggregated per variant and fed to addScpLinesToCart, which prices
 * garment + decoration exactly like a Studio add. Names/numbers ride along on
 * each line's metadata so production still knows who gets what.
 */
import { sortSizes } from "./garment-measurements"
import { isScpPrintSizeId, type ScpPrintSizeId } from "./scp-dtf-print-pricing"
import type { ScpAddLineInput } from "./scp-add-lines"
import { colourFrontImage } from "./sizing-kit"

export type RosterVariant = {
  id: string
  title?: string | null
  options?: Array<{ value?: string | null; option?: { title?: string | null } | null }>
}

export type RosterParticipant = {
  id: string
  name: string
  size_label: string
  quantity: number
  player_number?: string | null
  custom_notes?: string | null
}

const COLOR_RE = /(colou?r|shade)/i
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase()
const colourOf = (v: RosterVariant) =>
  (v.options ?? []).find((o) => COLOR_RE.test(o.option?.title ?? ""))?.value ?? null

/**
 * Size label → variant. Exact option-value match first, then an exact
 * " / "-separated title token. Never a substring match ("L" used to match
 * "Black / S"). When the organiser picked a base variant, only that colour
 * is considered.
 */
export function matchSizeVariant(
  variants: RosterVariant[],
  sizeLabel: string,
  baseVariantId?: string | null
): string | null {
  const target = norm(sizeLabel)
  if (!target) return null
  const base = variants.find((v) => v.id === baseVariantId)
  const baseColour = base ? colourOf(base) : null
  const pool = baseColour ? variants.filter((v) => colourOf(v) === baseColour) : variants
  const byOption = pool.find((v) => (v.options ?? []).some((o) => norm(o.value) === target))
  if (byOption) return byOption.id
  const byTitle = pool.find((v) => String(v.title ?? "").split("/").some((t) => norm(t) === target))
  return byTitle?.id ?? null
}

/**
 * The sizes offered on the public share page: the base design's colour only,
 * in garment order, so every choice matches a variant at convert time.
 * Listing every variant title and option value (cut at 30) gave a jumble of
 * colours and combinations that often missed the design's colour entirely.
 */
export function sizesForBaseColour(variants: RosterVariant[], baseVariantId?: string | null): string[] {
  const base = variants.find((v) => v.id === baseVariantId)
  const baseColour = base ? colourOf(base) : null
  const pool = baseColour ? variants.filter((v) => colourOf(v) === baseColour) : variants
  const sizes = new Set<string>()
  for (const v of pool) {
    const size = (v.options ?? []).find((o) => !COLOR_RE.test(o.option?.title ?? ""))?.value
    if (size) sizes.add(size)
  }
  if (!sizes.size) for (const v of pool) if (v.title) sizes.add(v.title)
  return sortSizes(Array.from(sizes))
}

/**
 * The organiser's colour's front photo, for the share page (null = no photo
 * of that colour). The product's main photo can be another colour: a model
 * in Bone for a White order.
 */
export function baseColourPhoto(
  variants: RosterVariant[],
  baseVariantId: string | null | undefined,
  images: string[]
): string | null {
  const base = variants.find((v) => v.id === baseVariantId)
  return base ? colourFrontImage(images, colourOf(base)) : null
}

/** The Studio's own line print size: scpPrintSizeId, else the largest print. */
export function printSizeIdForDesign(design: Record<string, unknown>): ScpPrintSizeId {
  if (isScpPrintSizeId(design.scpPrintSizeId)) return design.scpPrintSizeId
  const rank: ScpPrintSizeId[] = ["up_to_a6", "up_to_a4", "up_to_a3", "oversize"]
  const sizes = (Array.isArray(design.prints) ? design.prints : [])
    .map((p) => (p as { sizeId?: unknown })?.sizeId)
    .filter(isScpPrintSizeId)
  return sizes.sort((a, b) => rank.indexOf(b) - rank.indexOf(a))[0] ?? "up_to_a6"
}

/**
 * Aggregate the roster per variant into priced-line inputs. `design` null =
 * blank garments (plain lines). Unmatched sizes come back in `skipped`.
 * `images` (the product's photo URLs): each line's picture is its colour's
 * front photo, as on range orders; the cart showed the product's main photo
 * otherwise (a blue tee for a White order).
 */
export function rosterToDesignLines(input: {
  variants: RosterVariant[]
  baseVariantId?: string | null
  participants: RosterParticipant[]
  design: Record<string, unknown> | null
  groupOrderId: string
  images?: string[]
}): {
  lines: ScpAddLineInput[]
  skipped: Array<RosterParticipant & { reason: string }>
} {
  const byVariant = new Map<string, RosterParticipant[]>()
  const skipped: Array<RosterParticipant & { reason: string }> = []
  for (const p of input.participants) {
    const variantId = matchSizeVariant(input.variants, p.size_label, input.baseVariantId)
    if (!variantId) {
      skipped.push({ ...p, reason: "size_label did not match any variant" })
      continue
    }
    if (!byVariant.has(variantId)) byVariant.set(variantId, [])
    byVariant.get(variantId)!.push(p)
  }

  // Stale add-time pricing from when the design was saved must not survive;
  // the descriptor stamps a fresh server block. One shared group_id keeps the
  // lines together in the cart.
  const design = input.design
    ? (() => {
        const { pricing: _stale, ...rest } = input.design as Record<string, unknown>
        return { ...rest, group_id: `go_${input.groupOrderId}` }
      })()
    : null
  const printSizeId = design ? printSizeIdForDesign(design) : null

  const lines: ScpAddLineInput[] = [...byVariant].map(([variantId, people]) => {
    const variant = input.variants.find((v) => v.id === variantId)
    const thumbnail = variant ? colourFrontImage(input.images ?? [], colourOf(variant)) : null
    return {
      variant_id: variantId,
      quantity: people.reduce((sum, p) => sum + Math.max(1, Number(p.quantity) || 1), 0),
      print_size_id: printSizeId,
      ...(thumbnail ? { thumbnail } : {}),
      metadata: {
        ...(thumbnail ? { colour_thumbnail: true } : {}),
        group_order_id: input.groupOrderId,
        // Who gets what — names/numbers print per garment.
        group_order_participants: people.map((p) => ({
          id: p.id,
          name: p.name,
          quantity: Math.max(1, Number(p.quantity) || 1),
          player_number: p.player_number ?? null,
          notes: p.custom_notes ?? null,
        })),
        ...(design ? { customizerDesign: design } : {}),
      },
    }
  })
  return { lines, skipped }
}
