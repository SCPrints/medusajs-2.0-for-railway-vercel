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
  SHIPPING_PACKAGING_OVERHEAD_GRAMS,
  SHIPSTATION_WAREHOUSE_ADDRESS_1,
  SHIPSTATION_WAREHOUSE_CITY,
  SHIPSTATION_WAREHOUSE_COUNTRY_CODE,
  SHIPSTATION_WAREHOUSE_NAME,
  SHIPSTATION_WAREHOUSE_PHONE,
  SHIPSTATION_WAREHOUSE_POSTCODE,
  SHIPSTATION_WAREHOUSE_STATE,
} from "../../lib/constants"
import { ShipStationClient } from "./client"
import { GetShippingRatesResponse, Rate, ShipStationAddress } from "./types"

const coerceWeightGrams = (raw: unknown): number => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number.parseFloat(raw)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return 0
}

const lineItemWeightGrams = (item: any): number => {
  const fromMetadata = item?.metadata
    ? coerceWeightGrams(item.metadata.weight_grams)
    : 0
  if (fromMetadata) {
    return fromMetadata
  }
  const variantWeight = coerceWeightGrams(item?.variant?.weight)
  if (variantWeight) {
    return variantWeight
  }
  return coerceWeightGrams(item?.variant?.product?.weight ?? item?.product?.weight)
}

type InjectedDependencies = {
  logger: Logger
}

export type ShipStationOptions = {
  api_key: string
}

class ShipStationProviderService extends AbstractFulfillmentProviderService {
  static identifier = "shipstation"
  protected options_: ShipStationOptions
  protected client: ShipStationClient
  protected logger_: Logger

  constructor({ logger }: InjectedDependencies, options: ShipStationOptions) {
    super()

    this.options_ = options
    this.client = new ShipStationClient(options)
    this.logger_ = logger
  }

  static validateOptions(options: Record<string, any>) {
    if (!options.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "api_key is required for the shipstation fulfillment provider."
      )
    }
  }

  /**
   * Exposes the underlying ShipStation client for trusted callers
   * (e.g. the `/hooks/shipstation` webhook route).
   */
  getClient(): ShipStationClient {
    return this.client
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    const { carriers } = await this.client.getCarriers()
    const fulfillmentOptions: FulfillmentOption[] = []

    carriers
      .filter((carrier) => !carrier.disabled_by_billing_plan)
      .forEach((carrier) => {
        carrier.services.forEach((service) => {
          fulfillmentOptions.push({
            id: `${carrier.carrier_id}__${service.service_code}`,
            name: service.name,
            carrier_id: carrier.carrier_id,
            carrier_service_code: service.service_code,
          } as unknown as FulfillmentOption)
        })
      })

    return fulfillmentOptions
  }

  async canCalculate(data: CreateShippingOptionDTO): Promise<boolean> {
    return true
  }

  private buildShipFrom(from_address?: {
    name?: string
    address?: Omit<StockLocationAddressDTO, "created_at" | "updated_at" | "deleted_at">
  }): ShipStationAddress {
    const a = from_address?.address
    const postal = a?.postal_code || SHIPSTATION_WAREHOUSE_POSTCODE || ""
    const country = a?.country_code || SHIPSTATION_WAREHOUSE_COUNTRY_CODE || ""

    if (!postal || !country) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "ShipStation requires a from postcode and country code (set the stock location address or SHIPSTATION_WAREHOUSE_* envs)."
      )
    }

    return {
      name: from_address?.name || SHIPSTATION_WAREHOUSE_NAME || "Warehouse",
      phone: a?.phone || SHIPSTATION_WAREHOUSE_PHONE || "",
      address_line1: a?.address_1 || SHIPSTATION_WAREHOUSE_ADDRESS_1 || "",
      city_locality: a?.city || SHIPSTATION_WAREHOUSE_CITY || "",
      state_province: a?.province || SHIPSTATION_WAREHOUSE_STATE || "",
      postal_code: postal,
      country_code: country,
      address_residential_indicator: "unknown",
    }
  }

  private async createShipment({
    carrier_id,
    carrier_service_code,
    from_address,
    to_address,
    items,
    currency_code,
    external_order_id,
    external_shipment_id,
  }: {
    carrier_id: string
    carrier_service_code: string
    from_address?: {
      name?: string
      address?: Omit<StockLocationAddressDTO, "created_at" | "updated_at" | "deleted_at">
    }
    to_address?: Omit<CartAddressDTO, "created_at" | "updated_at" | "deleted_at" | "id">
    items: CartLineItemDTO[] | OrderLineItemDTO[]
    currency_code: string
    /** Medusa order id — surfaced as ShipStation `external_order_id` so the webhook can resolve back. */
    external_order_id?: string
    /** Medusa fulfillment id — surfaced as `external_shipment_id`. */
    external_shipment_id?: string
  }): Promise<GetShippingRatesResponse> {
    const ship_from = this.buildShipFrom(from_address)

    if (!to_address) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "shipping_address is required to calculate shipping rate"
      )
    }

    if (!to_address.postal_code || !to_address.country_code) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "shipping_address.postal_code and country_code are required to calculate shipping rate"
      )
    }

    const ship_to: ShipStationAddress = {
      name: `${to_address.first_name || ""} ${to_address.last_name || ""}`.trim(),
      phone: to_address.phone || "",
      address_line1: to_address.address_1 || "",
      city_locality: to_address.city || "",
      state_province: to_address.province || "",
      postal_code: to_address.postal_code,
      country_code: to_address.country_code,
      address_residential_indicator: "unknown",
    }

    // Σ(item weight × quantity) in grams, then add packaging overhead, then convert to kg.
    const itemsWeightGrams = items.reduce((sum, item) => {
      const qty = (item as any)?.quantity ?? 1
      return sum + lineItemWeightGrams(item) * (typeof qty === "number" && qty > 0 ? qty : 1)
    }, 0)
    const totalWeightGrams = itemsWeightGrams + (SHIPPING_PACKAGING_OVERHEAD_GRAMS || 0)
    // ShipStation expects a positive weight. Fall back to 100g if every item is
    // missing a weight so the rate call doesn't 400 — the storefront and admin
    // widgets will surface the missing-weight warning separately.
    const safeWeightGrams = totalWeightGrams > 0 ? totalWeightGrams : 100
    const packageWeightKg = Number((safeWeightGrams / 1000).toFixed(3))

    return await this.client.getShippingRates({
      shipment: {
        carrier_id,
        service_code: carrier_service_code,
        ship_to,
        ship_from,
        // @ts-ignore external_order_id accepted by ShipStation but not in local type
        external_order_id,
        // @ts-ignore external_shipment_id accepted by ShipStation but not in local type
        external_shipment_id,
        // @ts-ignore accepted by ShipStation but not in local type
        validate_address: "no_validation",
        items: items?.map((item) => ({
          // @ts-ignore shared field not guaranteed in all DTOs
          name: item.title,
          quantity: item.quantity,
          // @ts-ignore shared field not guaranteed in all DTOs
          sku: item.variant_sku || "",
        })),
        // @ts-ignore packages accepted by ShipStation but omitted in narrowed type
        packages: [
          {
            weight: {
              value: packageWeightKg,
              unit: "kilogram",
            },
          },
        ],
        // @ts-ignore customs accepted by ShipStation but omitted in narrowed type
        customs: {
          contents: "merchandise",
          non_delivery: "return_to_sender",
        },
      },
      rate_options: {
        carrier_ids: [carrier_id],
        service_codes: [carrier_service_code],
        preferred_currency: currency_code,
      },
    })
  }

  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const { shipment_id } = ((data as { shipment_id?: string }) || {}) as {
      shipment_id?: string
    }
    const { carrier_id, carrier_service_code } = optionData as {
      carrier_id: string
      carrier_service_code: string
    }
    let rate: Rate | undefined

    if (!shipment_id) {
      const shipment = await this.createShipment({
        carrier_id,
        carrier_service_code,
        from_address: {
          // @ts-ignore contextual stock location types vary by workflow
          name: context.from_location?.name,
          // @ts-ignore contextual stock location types vary by workflow
          address: context.from_location?.address,
        },
        // @ts-ignore context type differs across flows
        to_address: context.shipping_address,
        // @ts-ignore context type differs across flows
        items: context.items || [],
        // @ts-ignore context type differs across flows
        currency_code: context.currency_code as string,
      })
      rate = shipment.rate_response?.rates?.[0]
    } else {
      const rateResponse = await this.client.getShipmentRates(shipment_id)
      rate = Array.isArray(rateResponse)
        ? rateResponse?.[0]?.rates?.[0]
        : rateResponse?.rates?.[0]
    }

    const calculatedPrice = !rate
      ? 0
      : rate.shipping_amount.amount +
        rate.insurance_amount.amount +
        rate.confirmation_amount.amount +
        rate.other_amount.amount +
        (rate.tax_amount?.amount || 0)

    return {
      calculated_amount: calculatedPrice,
      is_calculated_price_tax_inclusive: !!rate?.tax_amount,
    }
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<any> {
    let { shipment_id } = data as {
      shipment_id?: string
    }

    if (!shipment_id) {
      const { carrier_id, carrier_service_code } = optionData as {
        carrier_id: string
        carrier_service_code: string
      }

      const shipment = await this.createShipment({
        carrier_id,
        carrier_service_code,
        from_address: {
          // @ts-ignore context payload from workflows
          name: context.from_location?.name,
          // @ts-ignore context payload from workflows
          address: context.from_location?.address,
        },
        // @ts-ignore context payload from workflows
        to_address: context.shipping_address,
        // @ts-ignore context payload from workflows
        items: context.items || [],
        // @ts-ignore context payload from workflows
        currency_code: context.currency_code,
      })
      shipment_id = shipment.shipment_id
    }

    return {
      ...data,
      shipment_id,
    }
  }

  async createFulfillment(
    data: object,
    items: object[],
    order: object | undefined,
    fulfillment: Record<string, unknown>
  ): Promise<any> {
    const { shipment_id } = data as {
      shipment_id: string
    }

    const originalShipment = await this.client.getShipment(shipment_id)
    const orderItemsToFulfill: any[] = []

    items.forEach((item: any) => {
      // @ts-ignore order type is dynamic in provider lifecycle
      const orderItem = order?.items?.find((i) => i.id === item.line_item_id)

      if (!orderItem) {
        return
      }

      orderItemsToFulfill.push({
        ...orderItem,
        quantity: item.quantity,
      })
    })

    const orderId = (order as any)?.id as string | undefined
    const fulfillmentId = (fulfillment as any)?.id as string | undefined

    const newShipment = await this.createShipment({
      carrier_id: originalShipment.carrier_id,
      carrier_service_code: originalShipment.service_code,
      from_address: {
        name: originalShipment.ship_from.name,
        address: {
          ...originalShipment.ship_from,
          // @ts-ignore conversion to stock-location-style shape
          address_1: originalShipment.ship_from.address_line1,
          // @ts-ignore conversion to stock-location-style shape
          city: originalShipment.ship_from.city_locality,
          // @ts-ignore conversion to stock-location-style shape
          province: originalShipment.ship_from.state_province,
        },
      },
      to_address: {
        ...originalShipment.ship_to,
        // @ts-ignore conversion to cart-address-style shape
        address_1: originalShipment.ship_to.address_line1,
        // @ts-ignore conversion to cart-address-style shape
        city: originalShipment.ship_to.city_locality,
        // @ts-ignore conversion to cart-address-style shape
        province: originalShipment.ship_to.state_province,
      },
      items: orderItemsToFulfill as OrderLineItemDTO[],
      // @ts-ignore order object is dynamic
      currency_code: order?.currency_code,
      external_order_id: orderId,
      external_shipment_id: fulfillmentId,
    })

    const label = await this.client.purchaseLabelForShipment(newShipment.shipment_id)

    return {
      data: {
        ...(((fulfillment.data as object) || {}) as object),
        label_id: label.label_id,
        shipment_id: label.shipment_id,
        external_order_id: orderId,
        external_shipment_id: fulfillmentId,
      },
    }
  }

  async cancelFulfillment(data: Record<string, unknown>): Promise<any> {
    const { label_id, shipment_id } = data as {
      label_id: string
      shipment_id: string
    }

    if (!label_id || !shipment_id) {
      this.logger_.warn(
        "ShipStation fulfillment cancellation called without label_id or shipment_id."
      )
      return
    }

    await this.client.voidLabel(label_id)
    await this.client.cancelShipment(shipment_id)
  }
}

export default ShipStationProviderService
