import { HttpTypes } from "@medusajs/types"

type ProductWithTags = HttpTypes.StoreProduct & {
  tags?: { value?: string | null }[] | null
}

export function getStoreProductTagValues(product: HttpTypes.StoreProduct): string[] {
  const tags = (product as ProductWithTags).tags
  if (!tags?.length) {
    return []
  }

  const seen = new Set<string>()
  const out: string[] = []

  for (const t of tags) {
    const v = t?.value?.trim()
    if (!v) {
      continue
    }
    const key = v.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(v)
  }

  return out
}
