/**
 * Australia Post Shipping & Tracking API **v1** types.
 *
 * Reference: https://developers.auspost.com.au/apis/shipping-and-tracking/reference
 *
 * Only the fields we actually consume are typed; the API returns more.
 */

export type AusPostAddress = {
  /** First line is street, second is suite/unit/floor. AusPost accepts up to 3 lines. */
  lines: string[]
  suburb: string
  /** State code: ACT/NSW/NT/QLD/SA/TAS/VIC/WA. */
  state: string
  postcode: string
  /**
   * Omitted for domestic AU shipments (the v1 API doesn't expect it there);
   * required + set for international.
   */
  country?: string
  /** Optional but recommended — AusPost may SMS the recipient on delivery. */
  phone?: string | null
  email?: string | null
  /** Display name (recipient or sender). */
  name?: string | null
  business_name?: string | null
}

export type AusPostParcelDims = {
  /** Centimetres. */
  length: number
  /** Centimetres. */
  width: number
  /** Centimetres. */
  height: number
  /** Kilograms (NOT grams — AusPost is kg). */
  weight: number
}

export type AusPostShipmentItem = AusPostParcelDims & {
  /** Optional merchant-side reference (variant SKU, line item id). */
  item_reference?: string
  /** Quantity defaults to 1; AusPost prefers one item per parcel. */
  quantity?: number
  /**
   * Service product_id, e.g. "7E55" (Parcel Post). Account-derived. Treat as
   * opaque. Required at shipment creation; not required for a price quote.
   */
  product_id?: string
  /** Free-text description, used on commercial invoice for international. */
  description?: string
}

/**
 * POST /prices/items request — per-item rate shop.
 * `from`/`to` carry postcodes; each item carries its dims.
 */
export type AusPostItemPricesRequest = {
  from: { postcode: string; country?: string }
  to: { postcode: string; country?: string }
  items: Array<AusPostParcelDims & { item_reference?: string }>
}

export type AusPostPriceOption = {
  /** Account-specific service identifier — persist this; required at shipment time. */
  product_id: string
  /** Human-readable, e.g. "Parcel Post". */
  product_type?: string
  /** Price EXCLUSIVE of GST, in dollars (decimal). */
  calculated_price?: number
  /** GST component, in dollars. */
  calculated_gst?: number
  /** Optional ETA window. */
  estimated_delivery_date_range?: { min: string; max: string }
  [k: string]: unknown
}

export type AusPostItemPricesResponseItem = {
  item_reference?: string
  prices?: AusPostPriceOption[]
  errors?: { code?: string; name?: string; message: string }[]
}

export type AusPostItemPricesResponse = {
  items?: AusPostItemPricesResponseItem[]
  errors?: { code?: string; name?: string; message: string }[]
}

export type AusPostCreateShipmentRequest = {
  shipments: Array<{
    shipment_reference: string
    customer_reference_1?: string
    customer_reference_2?: string
    sender_references?: string[]
    from: AusPostAddress
    to: AusPostAddress
    items: AusPostShipmentItem[]
    /**
     * Per-shipment features (signature on delivery, transit cover, etc.).
     * Account-specific — only set what the merchant explicitly configures.
     */
    features?: Record<string, unknown>
    movement_type?: "DESPATCH" | "RETURN" | "TRANSFER"
  }>
}

export type AusPostCreatedShipmentItem = {
  item_id: string
  item_reference?: string
  tracking_details?: {
    consignment_id?: string
    article_id?: string
    barcode_id?: string
  }
}

export type AusPostCreatedShipment = {
  shipment_id: string
  shipment_reference?: string
  shipment_creation_date?: string
  customer_reference_1?: string
  items: AusPostCreatedShipmentItem[]
  /** Sum of item costs (AUD inc GST). */
  shipment_summary?: {
    total_cost?: number
    total_cost_ex_gst?: number
    total_gst?: number
    total_articles?: number
  }
}

export type AusPostCreateShipmentResponse = {
  shipments?: AusPostCreatedShipment[]
  errors?: { code?: string; name?: string; message: string; context?: Record<string, unknown> }[]
}

export type AusPostLabelRequest = {
  /** Always `true` for the merchant integration — sync response is much simpler than polling. */
  wait_for_label_url: boolean
  preferences: Array<{
    type: "PRINT"
    format: "PDF" | "ZPL" | "PNG"
    groups: Array<{
      /** Group name, e.g. "Parcel Post" / "Express Post" (verified-correct). */
      group: string
      /** e.g. "A4-1pp" (one per page), "A6-1pp" (thermal). */
      layout?: string
      /** Mandatory on the v1 labels API. */
      branded?: boolean
      left_offset?: number
      top_offset?: number
    }>
  }>
  shipments: Array<{ shipment_id: string }>
}

export type AusPostLabelResponse = {
  labels?: Array<{
    request_id?: string
    /** Signed URL — short-lived. Re-fetch via getLabel if expired. */
    url?: string
    status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED"
  }>
  errors?: { code?: string; name?: string; message: string }[]
}

export type AusPostTrackingEvent = {
  description: string
  location?: string
  /** v1 uses `date` (not `event_date_time`). */
  date: string
  signer_name?: string
}

export type AusPostTrackableItem = {
  article_id?: string
  /** Per-article event log. */
  events?: AusPostTrackingEvent[]
  status?: string
}

export type AusPostTrackingResult = {
  tracking_id: string
  status?:
    | "In transit"
    | "Delivered"
    | "Awaiting collection"
    | "Lodged"
    | "Returned"
    | string
  /** Events live UNDER trackable_items, not on the result directly. */
  trackable_items?: AusPostTrackableItem[]
  errors?: { code?: string; name?: string; message: string }[]
}

export type AusPostTrackingResponse = {
  tracking_results?: AusPostTrackingResult[]
  errors?: { code?: string; name?: string; message: string }[]
}

/** Default Australia Post service product_ids (verify against /prices/items per account). */
export const AUSPOST_DEFAULT_PRODUCT_IDS = {
  PARCEL_POST: "7E55",
  EXPRESS_POST: "7E54",
  PARCEL_POST_RETURNS: "3D55",
} as const

export type AusPostServiceKind = keyof typeof AUSPOST_DEFAULT_PRODUCT_IDS
