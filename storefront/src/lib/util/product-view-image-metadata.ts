/**
 * Keys on `product.metadata` for catalog angled images (AS Colour / spreadsheet sync).
 * Must stay aligned with backend `PRODUCT_VIEW_IMAGE_METADATA_KEYS` in `spreadsheet-sync-import.ts`.
 */
export const PRODUCT_VIEW_IMAGE_META_KEYS_ORDERED = [
  "image_standard_url",
  "image_front_url",
  "image_side_url",
  "image_back_url",
] as const
