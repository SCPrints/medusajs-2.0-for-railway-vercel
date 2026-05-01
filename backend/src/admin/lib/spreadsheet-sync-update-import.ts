import type { ParsedCsv } from "./csv-import"

/** Payload accepted by `sdk.admin.product.batch({ update })`. */
export type SpreadsheetProductUpdate = Record<string, unknown>

export const PRODUCT_UPDATE_BATCH_CHUNK_SIZE = 15

export const PRODUCT_UPDATE_REQUIRED_HEADERS = ["product id"] as const

export type ProductUpdatePreview = {
  productCount: number
  variantRowCount: number
  validationErrors: string[]
}

const TRUEISH = (raw: string): boolean => {
  const v = raw.trim().toLowerCase()
  return v === "true" || v === "1" || v === "yes"
}

type ProductUpdateStatus = "draft" | "published" | "proposed" | "rejected"

const normalizeStatus = (raw: string | undefined): ProductUpdateStatus => {
  const s = (raw ?? "").trim().toLowerCase()
  if (s === "draft" || s === "published" || s === "proposed" || s === "rejected") {
    return s
  }
  return "draft"
}

export function validateProductUpdateHeaders(parsed: ParsedCsv): string | null {
  const headers = new Set(parsed.headers)
  for (const h of PRODUCT_UPDATE_REQUIRED_HEADERS) {
    if (!headers.has(h)) {
      return `Missing required column "${h}". Use an export from Medusa (import template) so each row includes Product Id.`
    }
  }
  return null
}

export function computeProductUpdatePreview(parsed: ParsedCsv): ProductUpdatePreview {
  const validationErrors: string[] = []
  const headerErr = validateProductUpdateHeaders(parsed)
  if (headerErr) {
    validationErrors.push(headerErr)
    return {
      productCount: 0,
      variantRowCount: parsed.rows.length,
      validationErrors,
    }
  }

  const ids = new Set<string>()
  parsed.rows.forEach((row, idx) => {
    const rowLabel = `Row ${idx + 2}`
    const pid = (row["product id"] ?? "").trim()
    if (!pid) {
      validationErrors.push(`${rowLabel}: missing Product Id`)
      return
    }
    ids.add(pid)
  })

  return {
    productCount: ids.size,
    variantRowCount: parsed.rows.length,
    validationErrors,
  }
}

const groupRowsByProductId = (rows: Record<string, string>[]): Map<string, Record<string, string>[]> => {
  const map = new Map<string, Record<string, string>[]>()
  for (const row of rows) {
    const id = (row["product id"] ?? "").trim()
    if (!id) {
      continue
    }
    const list = map.get(id)
    if (list) {
      list.push(row)
    } else {
      map.set(id, [row])
    }
  }
  return map
}

/**
 * Build partial product updates from template CSV rows (first row per Product Id wins for product-level fields).
 */
export function buildBatchUpdatesFromParsedCsv(parsed: ParsedCsv): {
  updates: SpreadsheetProductUpdate[]
  errors: string[]
} {
  const errors: string[] = []

  const headerErr = validateProductUpdateHeaders(parsed)
  if (headerErr) {
    errors.push(headerErr)
    return { updates: [], errors }
  }

  const preview = computeProductUpdatePreview(parsed)
  preview.validationErrors.forEach((e) => errors.push(e))
  if (preview.validationErrors.length > 0) {
    return { updates: [], errors }
  }

  const grouped = groupRowsByProductId(parsed.rows)
  const updates: SpreadsheetProductUpdate[] = []

  for (const [productId, rows] of grouped) {
    const first = rows[0]!

    const patch: SpreadsheetProductUpdate = {
      id: productId,
    }

    const title = (first["product title"] ?? "").trim()
    if (title) {
      patch.title = title
    }

    const subtitle = (first["product subtitle"] ?? "").trim()
    if (subtitle) {
      patch.subtitle = subtitle
    }

    const description = (first["product description"] ?? "").trim()
    if (description) {
      patch.description = description
    }

    const handle = (first["product handle"] ?? "").trim()
    if (handle) {
      patch.handle = handle
    }

    const thumbnail = (first["product thumbnail"] ?? "").trim()
    if (thumbnail) {
      patch.thumbnail = thumbnail
    }

    const statusRaw = (first["product status"] ?? "").trim()
    if (statusRaw !== "") {
      patch.status = normalizeStatus(statusRaw)
    }

    const discountRaw = (first["product discountable"] ?? "").trim()
    if (discountRaw !== "") {
      patch.discountable = TRUEISH(discountRaw)
    }

    const externalId = (first["product external id"] ?? "").trim()
    if (externalId) {
      patch.external_id = externalId
    }

    const collectionId = (first["product collection id"] ?? "").trim()
    if (collectionId) {
      patch.collection_id = collectionId
    }

    const typeId = (first["product type id"] ?? "").trim()
    if (typeId) {
      patch.type_id = typeId
    }

    const shippingProfileId = (first["shipping profile id"] ?? "").trim()
    if (shippingProfileId) {
      patch.shipping_profile_id = shippingProfileId
    }

    const salesChannelId = (first["product sales channel 1 id"] ?? "").trim()
    if (salesChannelId) {
      patch.sales_channels = [{ id: salesChannelId }]
    }

    const tagId = (first["product tag 1 id"] ?? "").trim()
    if (tagId) {
      patch.tags = [{ id: tagId }]
    }

    const hs = (first["product hs code"] ?? "").trim()
    if (hs) {
      patch.hs_code = hs
    }

    const origin = (first["product origin country"] ?? "").trim()
    if (origin) {
      patch.origin_country = origin
    }

    const mid = (first["product mid code"] ?? "").trim()
    if (mid) {
      patch.mid_code = mid
    }

    const material = (first["product material"] ?? "").trim()
    if (material) {
      patch.material = material
    }

    const weightRaw = (first["product weight"] ?? "").trim()
    if (weightRaw !== "") {
      const n = Number(weightRaw)
      if (Number.isFinite(n)) {
        patch.weight = n
      }
    }

    /** Only `id` means nothing to change — skip or warn */
    const keysToSend = Object.keys(patch).filter((k) => k !== "id")
    if (keysToSend.length === 0) {
      errors.push(
        `Product "${productId}": no non-empty product-level fields to update (first row only; fill columns like Title, Collection Id, Type Id, Tag 1 Id, etc.).`
      )
      continue
    }

    updates.push(patch)
  }

  return { updates, errors }
}
