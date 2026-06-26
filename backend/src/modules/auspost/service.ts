import {
  CartAddressDTO,
  CartLineItemDTO,
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateShippingOptionDTO,
  FulfillmentOption,
  Logger,
  OrderLineItemDTO,
  StockLocationAddressDTO,
} from "@medusajs/framework/types"
import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils"
import {
  AUSPOST_LABEL_FORMAT,
  AUSPOST_LABEL_LAYOUT,
  AUSPOST_PACKAGE_HEIGHT_CM,
  AUSPOST_PACKAGE_LENGTH_CM,
  AUSPOST_PACKAGE_WIDTH_CM,
  AUSPOST_WAREHOUSE_ADDRESS_1,
  AUSPOST_WAREHOUSE_CITY,
  AUSPOST_WAREHOUSE_COUNTRY_CODE,
  AUSPOST_WAREHOUSE_NAME,
  AUSPOST_WAREHOUSE_PHONE,
  AUSPOST_WAREHOUSE_POSTCODE,
  AUSPOST_WAREHOUSE_STATE,
  SHIPPING_PACKAGING_OVERHEAD_GRAMS,
} from "../../lib/constants"
import { AusPostClient } from "./client"
import {
  buildAusPostAddressFromCart,
  buildAusPostShipFromAddress,
  buildAusPostTrackingUrl,
  priceToNumber,
} from "./mapping"
import {
  AUSPOST_DEFAULT_PRODUCT_IDS,
  AusPostAddress,
  AusPostPriceOption,
  AusPostShipmentItem,
} from "./types"
import { lineItemWeightGrams } from "../../lib/cart-weight"

type InjectedDependencies = {
  logger: Logger
}

export type AusPostOptions = {
  /** API key (UUID) — the username half of the Basic Auth pair. */
  api_key: string
  /** API password — the secret half of the Basic Auth pair. */
  api_password: string
  /** 10-digit MyPost Business account number, sent as the Account-Number header. */
  account_number: string
  test_mode: boolean
  /** Optional per-account service-code overrides. */
  parcel_product_id?: string
  express_product_id?: string
  label_format?: "PDF" | "ZPL" | "PNG"
  label_layout?: string
}

/**
 * AusPost Shipping & Tracking **v1** fulfillment provider (HTTP Basic Auth).
 *
 * Mirrors the ShipStation provider's shape so the cart-shipping-options
 * tier filter, admin widgets, and shipment flow can switch with a single
 * env-var flip (LIVE_SHIPPING_PROVIDER).
 *
 * Differences from ShipStation:
 *  - No webhook push for tracking — see jobs/sync-auspost-tracking.ts which
 *    polls the Track API every 4h and (on first event) runs
 *    createOrderShipmentWorkflow to mark the order shipped + email the customer.
 *  - getFulfillmentOptions() returns a fixed pair (Parcel Post / Express Post)
 *    — AusPost has no equivalent of ShipStation's GET /carriers.
 *  - calculatePrice() returns DOLLARS (major units), same as ShipStation, NOT
 *    cents — Medusa's calculated_amount is in major units here.
 *  - createFulfillment() does two API calls (createShipment + generateLabels)
 *    where ShipStation does one.
 */
class AusPostProviderService extends AbstractFulfillmentProviderService {
  static identifier = "auspost"
  protected options_: AusPostOptions
  protected client: AusPostClient
  protected logger_: Logger

  constructor({ logger }: InjectedDependencies, options: AusPostOptions) {
    super()
    this.options_ = options
    this.client = new AusPostClient(options)
    this.logger_ = logger
  }

  static validateOptions(options: Record<string, any>) {
    const required = ["api_key", "api_password", "account_number"]
    for (const key of required) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `${key} is required for the auspost fulfillment provider.`
        )
      }
    }
  }

  /** Exposes the client for the tracking-poll cron + diagnostics. */
  getClient(): AusPostClient {
    return this.client
  }

  /**
   * AusPost doesn't expose a "list services" endpoint, so we return a fixed
   * pair: Parcel Post (standard) + Express Post (overnight). Staff can
   * override the product_ids via env vars per-account.
   *
   * The `id` here becomes the Medusa shipping option's `data.product_id`,
   * which `calculatePrice` later matches against the /prices/items response.
   */
  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    const parcelId =
      this.options_.parcel_product_id || AUSPOST_DEFAULT_PRODUCT_IDS.PARCEL_POST
    const expressId =
      this.options_.express_product_id || AUSPOST_DEFAULT_PRODUCT_IDS.EXPRESS_POST

    return [
      {
        id: parcelId,
        name: "Australia Post — Parcel Post",
        // @ts-ignore extra fields persisted as option data
        product_id: parcelId,
        // @ts-ignore extra fields persisted as option data
        service_label: "Parcel Post",
      } as unknown as FulfillmentOption,
      {
        id: expressId,
        name: "Australia Post — Express Post",
        // @ts-ignore extra fields persisted as option data
        product_id: expressId,
        // @ts-ignore extra fields persisted as option data
        service_label: "Express Post",
      } as unknown as FulfillmentOption,
    ]
  }

  async canCalculate(_data: CreateShippingOptionDTO): Promise<boolean> {
    return true
  }

  private buildShipFrom(from_address?: {
    name?: string
    address?: Omit<StockLocationAddressDTO, "created_at" | "updated_at" | "deleted_at">
  }): AusPostAddress {
    return buildAusPostShipFromAddress({
      name: from_address?.name,
      address: from_address?.address,
      fallbacks: {
        address_1: AUSPOST_WAREHOUSE_ADDRESS_1,
        city: AUSPOST_WAREHOUSE_CITY,
        state: AUSPOST_WAREHOUSE_STATE,
        postcode: AUSPOST_WAREHOUSE_POSTCODE,
        country: AUSPOST_WAREHOUSE_COUNTRY_CODE,
        phone: AUSPOST_WAREHOUSE_PHONE,
        name: AUSPOST_WAREHOUSE_NAME,
      },
    })
  }

  /** Sum line-item weights × quantity, add packaging overhead, return kilograms. */
  private computeShipmentWeightKg(items: CartLineItemDTO[] | OrderLineItemDTO[]): number {
    const itemsWeightGrams = items.reduce((sum, item) => {
      const qty = (item as any)?.quantity ?? 1
      const safeQty = typeof qty === "number" && qty > 0 ? qty : 1
      return sum + lineItemWeightGrams(item as any) * safeQty
    }, 0)
    const totalGrams = itemsWeightGrams + (SHIPPING_PACKAGING_OVERHEAD_GRAMS || 0)
    // AusPost rejects 0 weight — fall back to 100g for digital edge cases.
    const safeGrams = totalGrams > 0 ? totalGrams : 100
    return Number((safeGrams / 1000).toFixed(3))
  }

  /**
   * Quote rates for a single option. Returns the matching service's price in
   * DOLLARS (inclusive of GST), or 0 if the option's product_id isn't quoted.
   */
  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    _data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const { product_id } = (optionData || {}) as { product_id?: string }

    if (!product_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "AusPost shipping option is missing product_id. " +
          "Set the AusPost service product_id on the shipping option in Admin → Settings → Locations & Shipping."
      )
    }

    // @ts-ignore context payload from workflows
    const to = context.shipping_address
    // @ts-ignore context payload from workflows
    const items = (context.items || []) as CartLineItemDTO[]
    if (!to) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "shipping_address is required to calculate AusPost rate"
      )
    }

    const fromAddress = this.buildShipFrom({
      // @ts-ignore contextual stock location types vary by workflow
      name: context.from_location?.name,
      // @ts-ignore contextual stock location types vary by workflow
      address: context.from_location?.address,
    })
    const toAddress = buildAusPostAddressFromCart(to as CartAddressDTO)
    const weightKg = this.computeShipmentWeightKg(items)
    const isDomestic = (toAddress.country ?? "AU") === "AU"

    const resp = await this.client.getItemPrices({
      from: { postcode: fromAddress.postcode },
      to: {
        postcode: toAddress.postcode,
        ...(isDomestic ? {} : { country: toAddress.country }),
      },
      items: [
        {
          length: AUSPOST_PACKAGE_LENGTH_CM,
          width: AUSPOST_PACKAGE_WIDTH_CM,
          height: AUSPOST_PACKAGE_HEIGHT_CM,
          weight: weightKg,
        },
      ],
    })

    const options = resp.items?.[0]?.prices || []
    const match = options.find((o) => o.product_id === product_id)

    if (!match) {
      this.logger_.warn(
        `AusPost calculatePrice: requested product_id ${product_id} not in /prices/items response ` +
          `(available: ${options.map((o) => o.product_id).join(", ") || "none"})`
      )
      return { calculated_amount: 0, is_calculated_price_tax_inclusive: true }
    }

    const dollars = pickPriceDollarsIncGst(match)
    return {
      calculated_amount: dollars,
      is_calculated_price_tax_inclusive: true,
    }
  }

  /**
   * Called by Medusa workflows before persisting the chosen shipping option.
   * AusPost has no equivalent of ShipStation's "validate shipment" handshake —
   * we just echo the option data forward.
   */
  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    _context: Record<string, unknown>
  ): Promise<any> {
    const { product_id } = optionData as { product_id?: string }
    if (!product_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "AusPost shipping option is missing product_id."
      )
    }
    return { ...data, product_id }
  }

  /**
   * Buy a label for this fulfillment:
   *  1. POST /shipments to create the consignment
   *  2. POST /labels (wait_for_label_url: true) to generate the PDF
   *
   * Persists tracking_details on the returned fulfillment.data so the tracking
   * poll cron can resolve back to the order without a second shipment fetch.
   */
  async createFulfillment(
    data: object,
    items: object[],
    order: object | undefined,
    fulfillment: Record<string, unknown>
  ): Promise<any> {
    const { product_id } = data as { product_id: string }
    if (!product_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "AusPost fulfillment requires product_id on the option data."
      )
    }

    const orderId = (order as any)?.id as string | undefined
    const fulfillmentId = (fulfillment as any)?.id as string | undefined
    const shippingAddress = (order as any)?.shipping_address as CartAddressDTO | undefined
    const stockLocation = (fulfillment as any)?.stock_location?.address as
      | StockLocationAddressDTO
      | undefined

    if (!shippingAddress) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "AusPost createFulfillment: order is missing shipping_address"
      )
    }

    const fromAddress = this.buildShipFrom({
      name: (fulfillment as any)?.stock_location?.name,
      address: stockLocation,
    })
    const toAddress = buildAusPostAddressFromCart(shippingAddress)

    // Sum weight across the items actually being fulfilled (may be partial).
    const orderItems = (order as any)?.items as OrderLineItemDTO[] | undefined
    const itemsToFulfill = (items as any[])
      .map((row) => {
        const matched = orderItems?.find((oi) => oi.id === row.line_item_id)
        return matched ? { ...matched, quantity: row.quantity ?? 1 } : null
      })
      .filter((x): x is OrderLineItemDTO & { quantity: number } => !!x)

    const weightKg = this.computeShipmentWeightKg(itemsToFulfill)

    // Unique shipment_reference for AusPost idempotency. Re-running
    // createFulfillment for the same Medusa fulfillment_id is rejected by
    // AusPost (duplicate reference) — that surfaces as a clearer error than a
    // silent double-charge.
    const shipmentReference = `medusa-fulfillment-${fulfillmentId || Date.now()}`

    const apItem: AusPostShipmentItem = {
      length: AUSPOST_PACKAGE_LENGTH_CM,
      width: AUSPOST_PACKAGE_WIDTH_CM,
      height: AUSPOST_PACKAGE_HEIGHT_CM,
      weight: weightKg,
      product_id,
      item_reference: orderId,
      quantity: 1,
    }

    const created = await this.client.createShipment({
      shipments: [
        {
          shipment_reference: shipmentReference,
          customer_reference_1: orderId,
          customer_reference_2: fulfillmentId,
          from: fromAddress,
          to: toAddress,
          items: [apItem],
          movement_type: "DESPATCH",
        },
      ],
    })

    const shipment = created.shipments?.[0]
    if (!shipment?.shipment_id) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "AusPost createShipment did not return a shipment_id"
      )
    }

    const labelGroup =
      product_id === (this.options_.express_product_id ||
        AUSPOST_DEFAULT_PRODUCT_IDS.EXPRESS_POST)
        ? "Express Post"
        : "Parcel Post"

    const labelResp = await this.client.generateLabels({
      wait_for_label_url: true,
      preferences: [
        {
          type: "PRINT",
          format: (this.options_.label_format || AUSPOST_LABEL_FORMAT) as
            | "PDF"
            | "ZPL"
            | "PNG",
          groups: [
            {
              group: labelGroup,
              layout: this.options_.label_layout || AUSPOST_LABEL_LAYOUT,
              branded: false,
              left_offset: 0,
              top_offset: 0,
            },
          ],
        },
      ],
      shipments: [{ shipment_id: shipment.shipment_id }],
    })

    const labelUrl = labelResp.labels?.[0]?.url
    const trackingId =
      shipment.items?.[0]?.tracking_details?.article_id ||
      shipment.items?.[0]?.tracking_details?.consignment_id ||
      null

    return {
      data: {
        ...(((fulfillment.data as object) || {}) as object),
        provider: "auspost",
        shipment_id: shipment.shipment_id,
        shipment_reference: shipmentReference,
        product_id,
        label_url: labelUrl ?? null,
        label_format: this.options_.label_format || AUSPOST_LABEL_FORMAT,
        tracking_id: trackingId,
        tracking_url: trackingId ? buildAusPostTrackingUrl(trackingId) : null,
        external_order_id: orderId,
        external_shipment_id: fulfillmentId,
        items: shipment.items?.map((it) => ({
          item_id: it.item_id,
          item_reference: it.item_reference,
          article_id: it.tracking_details?.article_id,
          consignment_id: it.tracking_details?.consignment_id,
        })),
      },
    }
  }

  /**
   * Void an unmanifested AusPost shipment.
   *
   * If the shipment has already been manifested (lodged) AusPost will reject
   * the DELETE and the merchant must refund the label via MyPost Business UI.
   * We log + swallow so the Medusa cancellation flow doesn't roll back the
   * order — the operator gets a "void manually in MyPost Business" hint in
   * the order audit instead.
   */
  async cancelFulfillment(data: Record<string, unknown>): Promise<any> {
    const { shipment_id } = data as { shipment_id?: string }
    if (!shipment_id) {
      this.logger_.warn("AusPost cancelFulfillment called without shipment_id.")
      return
    }
    try {
      await this.client.cancelShipment(shipment_id)
    } catch (err) {
      this.logger_.warn(
        `AusPost cancelShipment(${shipment_id}) failed (may already be manifested): ${
          (err as Error).message
        }`
      )
    }
  }

  /**
   * Returns the persisted label URL so admin "download label" surfaces work
   * without a second API call. AusPost label URLs are signed and expire; if
   * the URL 403s the merchant regenerates via POST /labels with the same
   * shipment_id.
   */
  async getFulfillmentDocuments(data: Record<string, unknown>): Promise<any> {
    const { label_url } = data as { label_url?: string }
    if (!label_url) return []
    return [{ url: label_url, type: "label" }]
  }
}

/** AusPost /prices/items returns ex-GST `calculated_price` + `calculated_gst`. Sum → inc-GST dollars. */
function pickPriceDollarsIncGst(o: AusPostPriceOption): number {
  const ex = priceToNumber(o.calculated_price)
  const gst = priceToNumber(o.calculated_gst)
  return Number((ex + gst).toFixed(2))
}

export default AusPostProviderService
