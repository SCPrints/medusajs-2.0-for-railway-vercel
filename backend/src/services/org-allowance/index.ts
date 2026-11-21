import { randomBytes } from "crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"

import { type AllowanceItem } from "../../lib/allowance"
import { ORGANISATION_MODULE } from "../../modules/organisation"
import type OrganisationModuleService from "../../modules/organisation/service"
import { listRangeItems, type RangeItem } from "../org-range"

export const orgService = (scope: MedusaContainer) => scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)

/** Unguessable, URL-safe, 144 bits. */
export const newAllowanceToken = () => randomBytes(18).toString("base64url")

export type DesignChoice = {
  design_id: string
  name: string
  thumbnail_url: string | null
  product_title: string | null
  garment_group: RangeItem["garment_group"]
  /** Sizes of the colour the design was saved on, in the garment's own order. */
  sizes: string[]
  base_colour: string | null
  variants: RangeItem["variants"]
}

/** The allowance's designs, from the organisation's range (so artwork, garment and sizes are the batch 1 ones). */
export async function designChoices(
  scope: MedusaContainer,
  organisationId: string,
  designIds: string[]
): Promise<Map<string, DesignChoice>> {
  const range = await listRangeItems(scope, organisationId)
  const out = new Map<string, DesignChoice>()
  for (const r of range) {
    if (!designIds.includes(r.design_id)) continue
    const atBase = r.variants.filter((v) => v.colour === r.base_colour)
    const sizes = Array.from(new Set((atBase.length ? atBase : r.variants).map((v) => v.size).filter(Boolean)))
    out.set(r.design_id, {
      design_id: r.design_id,
      name: r.name,
      thumbnail_url: r.thumbnail_url,
      product_title: r.product?.title ?? null,
      garment_group: r.garment_group,
      sizes,
      base_colour: r.base_colour,
      variants: r.variants,
    })
  }
  return out
}

export const variantForSize = (c: DesignChoice | undefined, size: string): string | null => {
  if (!c) return null
  const at = c.variants.filter((v) => v.size === size)
  return (at.find((v) => v.colour === c.base_colour) ?? at[0])?.id ?? null
}

/** The organisation's allowance, or 404 (also when it belongs to another organisation). */
export async function loadAllowance(scope: MedusaContainer, organisationId: string, id: string) {
  const [row] = (await orgService(scope).listOrganisationAllowances(
    { id, organisation_id: organisationId } as any,
    { take: 1 }
  )) as any[]
  if (!row) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Allowance not found.")
  return row as {
    id: string
    organisation_id: string
    name: string
    unit: string | null
    closes_at: Date | string | null
    status: "open" | "closed"
    items: AllowanceItem[]
    cart_id: string | null
    created_by: string
    created_at: Date | string
  }
}
