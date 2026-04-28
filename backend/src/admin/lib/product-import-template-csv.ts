/**
 * CSV rows matching Medusa Admin product-import template columns plus supplemental id/name columns.
 * Template columns mirror the official import CSV (one row per variant).
 */

/** Exact headers from Medusa product-import template (42 columns). */
export const PRODUCT_IMPORT_TEMPLATE_COLUMNS = [
  "Product Id",
  "Product Handle",
  "Product Title",
  "Product Subtitle",
  "Product Description",
  "Product Status",
  "Product Thumbnail",
  "Product Weight",
  "Product Length",
  "Product Width",
  "Product Height",
  "Product HS Code",
  "Product Origin Country",
  "Product MID Code",
  "Product Material",
  "Shipping Profile Id",
  "Product Sales Channel 1",
  "Product Collection Id",
  "Product Type Id",
  "Product Tag 1",
  "Product Discountable",
  "Product External Id",
  "Variant Id",
  "Variant Title",
  "Variant SKU",
  "Variant Barcode",
  "Variant Allow Backorder",
  "Variant Manage Inventory",
  "Variant Weight",
  "Variant Length",
  "Variant Width",
  "Variant Height",
  "Variant HS Code",
  "Variant Origin Country",
  "Variant MID Code",
  "Variant Material",
  "Variant Price EUR",
  "Variant Price USD",
  "Variant Option 1 Name",
  "Variant Option 1 Value",
  "Product Image 1 Url",
  "Product Image 2 Url",
] as const

/** Appended after the template for id + human-readable pairs (ignored by strict import parsers). */
export const PRODUCT_IMPORT_SUPPLEMENTAL_COLUMNS = [
  "Product Collection Title",
  "Product Type Value",
  "Product Sales Channel 1 Id",
  "Product Tag 1 Id",
] as const

export const PRODUCT_IMPORT_CSV_HEADERS: string[] = [
  ...PRODUCT_IMPORT_TEMPLATE_COLUMNS,
  ...PRODUCT_IMPORT_SUPPLEMENTAL_COLUMNS,
]

/** Fields passed to `sdk.admin.product.list` / compatible list endpoints. */
export const PRODUCT_IMPORT_EXPORT_LIST_FIELDS =
  [
    "id",
    "title",
    "subtitle",
    "status",
    "external_id",
    "description",
    "handle",
    "discountable",
    "thumbnail",
    "collection_id",
    "type_id",
    "weight",
    "length",
    "width",
    "height",
    "hs_code",
    "origin_country",
    "mid_code",
    "material",
    "shipping_profile_id",
    "*type",
    "*collection",
    "*tags",
    "*images",
    "*sales_channels",
    "*variants",
    "*variants.prices",
    "*variants.options",
    "*options",
    "*options.values",
  ].join(",")

const TRUE_FALSE = (value: unknown): string => {
  if (value === true || value === "true" || value === "TRUE") {
    return "TRUE"
  }
  if (value === false || value === "false" || value === "FALSE") {
    return "FALSE"
  }
  return ""
}

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ""
  }
  return String(value)
}

/**
 * Medusa stores price amounts in smallest currency units (e.g. cents). Import templates use major units.
 */
const minorToMajorCsv = (amount: unknown): string => {
  if (amount === null || amount === undefined || amount === "") {
    return ""
  }
  const n =
    typeof amount === "bigint"
      ? Number(amount)
      : typeof amount === "string"
        ? Number(amount)
        : typeof amount === "number"
          ? amount
          : Number.NaN
  if (!Number.isFinite(n)) {
    return ""
  }
  const major = n / 100
  return String(major)
}

const priceMajorForCurrency = (prices: unknown, currency: string): string => {
  if (!Array.isArray(prices)) {
    return ""
  }
  const want = currency.trim().toLowerCase()
  const row = prices.find(
    (p) =>
      String((p as Record<string, unknown>).currency_code ?? "")
        .trim()
        .toLowerCase() === want
  ) as Record<string, unknown> | undefined
  if (!row) {
    return ""
  }
  return minorToMajorCsv(row.amount)
}

const sortImagesByRank = (images: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(images)) {
    return []
  }
  const rows = images.filter((i) => i && typeof i === "object") as Array<Record<string, unknown>>
  return [...rows].sort((a, b) => {
    const ra = typeof a.rank === "number" ? a.rank : Number(a.rank ?? 0) || 0
    const rb = typeof b.rank === "number" ? b.rank : Number(b.rank ?? 0) || 0
    return ra - rb
  })
}

const imageUrls = (product: Record<string, unknown>): [string, string] => {
  const sorted = sortImagesByRank(product.images)
  const u0 = sorted[0]?.url != null ? String(sorted[0].url) : ""
  const u1 = sorted[1]?.url != null ? String(sorted[1].url) : ""
  return [u0, u1]
}

const firstSalesChannel = (
  product: Record<string, unknown>
): Record<string, unknown> | undefined => {
  const ch = product.sales_channels
  if (!Array.isArray(ch) || ch.length === 0) {
    return undefined
  }
  const first = ch[0]
  return first && typeof first === "object" ? (first as Record<string, unknown>) : undefined
}

const firstTag = (product: Record<string, unknown>): Record<string, unknown> | undefined => {
  const tags = product.tags
  if (!Array.isArray(tags) || tags.length === 0) {
    return undefined
  }
  const first = tags[0]
  return first && typeof first === "object" ? (first as Record<string, unknown>) : undefined
}

/** Best-effort: first variant option → option title + selected value (Medusa Admin shapes vary slightly). */
const firstVariantOptionPair = (
  product: Record<string, unknown>,
  variant: Record<string, unknown>
): { name: string; value: string } => {
  const opts = variant.options
  if (!Array.isArray(opts) || opts.length === 0) {
    return { name: "", value: "" }
  }
  const o = opts[0] as Record<string, unknown>
  const linked = (o.option ?? o.product_option) as Record<string, unknown> | undefined
  let name =
    (linked?.title != null ? String(linked.title) : "") ||
    (o.option_title != null ? String(o.option_title) : "") ||
    ""

  const optionId =
    (linked?.id as string | undefined) ??
    (o.option_id as string | undefined) ??
    (o.product_option_id as string | undefined)

  if (!name && optionId && Array.isArray(product.options)) {
    const po = (product.options as Record<string, unknown>[]).find((p) => p?.id === optionId)
    if (po?.title != null) {
      name = String(po.title)
    }
  }

  if (!name && Array.isArray(product.options) && product.options.length > 0) {
    const po = product.options[0] as Record<string, unknown>
    if (po?.title != null) {
      name = String(po.title)
    }
  }

  const ov = (o.option_value ?? o.optionValue) as Record<string, unknown> | undefined
  const value =
    (o.value != null ? String(o.value) : "") ||
    (ov?.value != null ? String(ov.value) : "") ||
    ""
  return { name, value }
}

/**
 * Build CSV body rows (without header) for products returned from Admin list/retrieve.
 * Skips products with no variants.
 */
export function buildProductImportTemplateRows(products: unknown[]): string[][] {
  const rows: string[][] = []

  for (const raw of products) {
    if (!raw || typeof raw !== "object") {
      continue
    }
    const product = raw as Record<string, unknown>
    const variants = product.variants
    if (!Array.isArray(variants) || variants.length === 0) {
      continue
    }

    const collection = product.collection as Record<string, unknown> | undefined
    const type = product.type as Record<string, unknown> | undefined
    const channel = firstSalesChannel(product)
    const tag = firstTag(product)
    const [img1, img2] = imageUrls(product)

    const collectionId = formatCell(collection?.id ?? product.collection_id ?? "")
    const collectionTitle = formatCell(collection?.title ?? "")
    const typeId = formatCell(type?.id ?? product.type_id ?? "")
    const typeValue = formatCell(type?.value ?? "")
    const channelName = formatCell(channel?.name ?? "")
    const channelId = formatCell(channel?.id ?? "")
    const tagValue = formatCell(tag?.value ?? "")
    const tagId = formatCell(tag?.id ?? "")

    for (const vr of variants) {
      if (!vr || typeof vr !== "object") {
        continue
      }
      const variant = vr as Record<string, unknown>
      const prices = variant.prices

      const opt = firstVariantOptionPair(product, variant)

      rows.push([
        formatCell(product.id),
        formatCell(product.handle),
        formatCell(product.title),
        formatCell(product.subtitle),
        formatCell(product.description),
        formatCell(product.status),
        formatCell(product.thumbnail),
        formatCell(product.weight),
        formatCell(product.length),
        formatCell(product.width),
        formatCell(product.height),
        formatCell(product.hs_code),
        formatCell(product.origin_country),
        formatCell(product.mid_code),
        formatCell(product.material),
        formatCell(product.shipping_profile_id),
        channelName,
        collectionId,
        typeId,
        tagValue,
        TRUE_FALSE(product.discountable),
        formatCell(product.external_id),
        formatCell(variant.id),
        formatCell(variant.title),
        formatCell(variant.sku),
        formatCell(variant.barcode),
        TRUE_FALSE(variant.allow_backorder),
        TRUE_FALSE(variant.manage_inventory),
        formatCell(variant.weight),
        formatCell(variant.length),
        formatCell(variant.width),
        formatCell(variant.height),
        formatCell(variant.hs_code),
        formatCell(variant.origin_country),
        formatCell(variant.mid_code),
        formatCell(variant.material),
        priceMajorForCurrency(prices, "eur"),
        priceMajorForCurrency(prices, "usd"),
        opt.name,
        opt.value,
        img1,
        img2,
        collectionTitle,
        typeValue,
        channelId,
        tagId,
      ])
    }
  }

  return rows
}
