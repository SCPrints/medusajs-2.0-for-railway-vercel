import { MedusaError } from "@medusajs/framework/utils"
import type { AusPostOptions } from "./service"
import {
  AusPostCreatedShipment,
  AusPostCreateShipmentRequest,
  AusPostCreateShipmentResponse,
  AusPostItemPricesRequest,
  AusPostItemPricesResponse,
  AusPostLabelRequest,
  AusPostLabelResponse,
  AusPostTrackingResponse,
} from "./types"

// Classic Shipping & Tracking API — v1, HTTP Basic Auth.
const PROD_API_BASE = "https://digitalapi.auspost.com.au/shipping/v1"
const TEST_API_BASE = "https://digitalapi.auspost.com.au/test/shipping/v1"

/**
 * AusPost Shipping & Tracking v1 client.
 *
 * Auth: HTTP Basic — `Authorization: Basic base64("<api_key>:<password>")` —
 * plus an `Account-Number` header. There is NO OAuth token endpoint for this
 * API generation; credentials are sent on every call.
 *
 * Retries: not implemented here — wrap calls in retry-with-backoff at the
 * caller layer if needed. POST /labels is the only call that's debited on
 * success, so naive retry of a 504 risks double-charge. Use a unique
 * shipment_reference on POST /shipments for idempotency on retry (AusPost
 * enforces uniqueness per account).
 */
export class AusPostClient {
  private options: AusPostOptions
  private authHeader: string

  constructor(options: AusPostOptions) {
    this.options = options
    this.authHeader =
      "Basic " +
      Buffer.from(`${options.api_key}:${options.api_password}`).toString("base64")
  }

  private get baseUrl(): string {
    return this.options.test_mode ? TEST_API_BASE : PROD_API_BASE
  }

  private async sendRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: this.authHeader,
        "Account-Number": this.options.account_number,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    })

    const contentType = resp.headers.get("content-type") || ""
    const isJson = contentType.includes("application/json")
    const body = isJson ? await resp.json() : await resp.text()

    if (!resp.ok) {
      const message = isJson
        ? this.formatErrors(body) || JSON.stringify(body).slice(0, 400)
        : String(body).slice(0, 400)
      throw new MedusaError(
        resp.status === 401 || resp.status === 403
          ? MedusaError.Types.UNAUTHORIZED
          : MedusaError.Types.INVALID_DATA,
        `AusPost ${path} failed (${resp.status}): ${message}`
      )
    }

    // Some endpoints surface a non-fatal errors[] on a 200 (e.g. one bad
    // shipment in a batch). Treat any populated errors[] as fatal here — we
    // only ever submit single-item batches, so a partial is a real failure.
    if (
      isJson &&
      Array.isArray((body as { errors?: unknown[] }).errors) &&
      (body as { errors: unknown[] }).errors.length
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `AusPost ${path} returned errors: ${this.formatErrors(body)}`
      )
    }

    return body as T
  }

  private formatErrors(body: unknown): string {
    const errors = (body as { errors?: { message?: string; code?: string; name?: string }[] })
      ?.errors
    if (!Array.isArray(errors) || errors.length === 0) return ""
    return errors
      .map((e) => [e.code, e.name, e.message].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("; ")
  }

  /**
   * POST /prices/items — per-item price across all eligible products.
   * Returns `items[].prices[]` each with `product_id` + `calculated_price`
   * (ex GST) + `calculated_gst`. This is the rate-shop endpoint: send the
   * parcel dims and read back every service product with its price, then the
   * service layer picks the one matching the shipping option's product_id.
   *
   * (Distinct from POST /prices/shipments, which only returns an aggregate
   * shipment_summary and can't be filtered per product_id.)
   */
  async getItemPrices(
    payload: AusPostItemPricesRequest
  ): Promise<AusPostItemPricesResponse> {
    return this.sendRequest<AusPostItemPricesResponse>("/prices/items", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  /**
   * POST /shipments — create one or more shipments (consignments).
   * Use a unique shipment_reference per attempt for idempotency on retry.
   */
  async createShipment(
    payload: AusPostCreateShipmentRequest
  ): Promise<AusPostCreateShipmentResponse> {
    return this.sendRequest<AusPostCreateShipmentResponse>("/shipments", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  /**
   * POST /labels — generate labels for one or more shipments.
   * With `wait_for_label_url: true` the response includes a signed URL
   * directly. This is the call that triggers AusPost billing.
   */
  async generateLabels(payload: AusPostLabelRequest): Promise<AusPostLabelResponse> {
    return this.sendRequest<AusPostLabelResponse>("/labels", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  /** GET /shipments/{shipment_id} — re-fetch a shipment incl. tracking IDs. */
  async getShipment(shipmentId: string): Promise<AusPostCreatedShipment> {
    const resp = await this.sendRequest<{ shipment?: AusPostCreatedShipment }>(
      `/shipments/${encodeURIComponent(shipmentId)}`
    )
    if (!resp.shipment) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `AusPost shipment ${shipmentId} not found`
      )
    }
    return resp.shipment
  }

  /**
   * GET /track?tracking_ids=… — tracking events for up to 10 IDs in one call.
   * Response: `tracking_results[]` each with `status` + `trackable_items[]`,
   * where the events live under `trackable_items[].events[]`.
   */
  async getTracking(trackingIds: string[]): Promise<AusPostTrackingResponse> {
    if (trackingIds.length === 0) {
      return { tracking_results: [] }
    }
    if (trackingIds.length > 10) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `AusPost track endpoint accepts max 10 tracking IDs per call (got ${trackingIds.length})`
      )
    }
    return this.sendRequest<AusPostTrackingResponse>(
      `/track?tracking_ids=${trackingIds.map(encodeURIComponent).join(",")}`
    )
  }

  /**
   * DELETE /shipments/{shipment_id} — void/cancel an unmanifested shipment.
   * Once manifested at the counter (or via POST /orders), this call returns
   * 4xx and refund must be done via the MyPost Business portal.
   */
  async cancelShipment(shipmentId: string): Promise<void> {
    await this.sendRequest<unknown>(
      `/shipments/${encodeURIComponent(shipmentId)}`,
      { method: "DELETE" }
    )
  }

  /**
   * Smoke test for diagnostics: a cheap authenticated GET against /accounts.
   * Returns true on a 2xx, false on any failure (does not throw). Note this
   * still sends Basic Auth creds, so a 401 correctly returns false.
   */
  async ping(): Promise<boolean> {
    try {
      await this.sendRequest<unknown>(
        `/accounts/${encodeURIComponent(this.options.account_number)}`
      )
      return true
    } catch {
      return false
    }
  }
}

// Convenience re-export so callers can `import { AusPostCreatedShipment } from "./client"`.
export type { AusPostCreatedShipment } from "./types"
