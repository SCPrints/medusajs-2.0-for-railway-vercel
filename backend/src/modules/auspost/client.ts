import { MedusaError } from "@medusajs/framework/utils"
import type { AusPostOptions } from "./service"
import {
  AusPostCreatedShipment,
  AusPostCreateShipmentRequest,
  AusPostCreateShipmentResponse,
  AusPostLabelRequest,
  AusPostLabelResponse,
  AusPostPriceQuoteRequest,
  AusPostPriceQuoteResponse,
  AusPostTrackingResponse,
} from "./types"

const PROD_API_BASE = "https://digitalapi.auspost.com.au/shipping/v2"
const TEST_API_BASE = "https://digitalapi.auspost.com.au/test/shipping/v2"
const OAUTH_TOKEN_URL = "https://welcome.api1.auspost.com.au/oauth/token"
const OAUTH_AUDIENCE = "https://digitalapi.auspost.com.au/shipping/v2"

type CachedToken = {
  access_token: string
  /** Epoch ms when this token expires. */
  expires_at: number
}

/**
 * AusPost Shipping & Tracking v2 client.
 *
 * Auth: OAuth client_credentials, cached for the token's TTL (~1h).
 * Headers on every data call:
 *   Authorization: Bearer <token>
 *   Account-Number: <account_number>
 *   Content-Type: application/json
 *
 * Retries: not implemented here — wrap calls in retry-with-backoff at the
 * caller layer if needed. POST /labels is the only call that's debited on
 * success, so naive retry of a 504 risks double-charge. Use shipment_reference
 * for idempotency on POST /shipments (AusPost enforces uniqueness per account).
 */
export class AusPostClient {
  private options: AusPostOptions
  private token: CachedToken | null = null

  constructor(options: AusPostOptions) {
    this.options = options
  }

  private get baseUrl(): string {
    return this.options.test_mode ? TEST_API_BASE : PROD_API_BASE
  }

  /** Returns a valid access_token, fetching from /oauth/token if cached one is missing or expired. */
  private async getAccessToken(): Promise<string> {
    const now = Date.now()
    if (this.token && this.token.expires_at > now + 30_000) {
      return this.token.access_token
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.options.oauth_client_id,
      client_secret: this.options.oauth_client_secret,
      audience: OAUTH_AUDIENCE,
      scope: "shipping",
    })

    const resp = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })

    const text = await resp.text()
    if (!resp.ok) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        `AusPost OAuth token request failed (${resp.status}): ${text.slice(0, 400)}`
      )
    }

    let json: { access_token?: string; expires_in?: number; token_type?: string }
    try {
      json = JSON.parse(text)
    } catch {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `AusPost OAuth returned non-JSON: ${text.slice(0, 200)}`
      )
    }

    if (!json.access_token) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `AusPost OAuth response missing access_token`
      )
    }

    const ttlSec = typeof json.expires_in === "number" && json.expires_in > 0
      ? json.expires_in
      : 3600
    this.token = {
      access_token: json.access_token,
      expires_at: now + ttlSec * 1000,
    }
    return this.token.access_token
  }

  /** Allow callers to invalidate the token (e.g. after a 401 retry). */
  invalidateToken(): void {
    this.token = null
  }

  private async sendRequest<T>(
    path: string,
    init?: RequestInit
  ): Promise<T> {
    const token = await this.getAccessToken()
    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
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
        resp.status === 401
          ? MedusaError.Types.UNAUTHORIZED
          : MedusaError.Types.INVALID_DATA,
        `AusPost ${path} failed (${resp.status}): ${message}`
      )
    }

    // Some endpoints (e.g. errors during a non-fatal partial) surface errors[] on 200.
    if (isJson && Array.isArray((body as { errors?: unknown[] }).errors) && (body as { errors: unknown[] }).errors.length) {
      const message = this.formatErrors(body)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `AusPost ${path} returned errors: ${message}`
      )
    }

    return body as T
  }

  private formatErrors(body: unknown): string {
    const errors = (body as { errors?: { message?: string; code?: string }[] })?.errors
    if (!Array.isArray(errors) || errors.length === 0) return ""
    return errors
      .map((e) => [e.code, e.message].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("; ")
  }

  /**
   * POST /prices/shipments — quote rates across one or more shipments.
   * Returns an array of available service products with prices per shipment.
   */
  async getPriceQuote(
    payload: AusPostPriceQuoteRequest
  ): Promise<AusPostPriceQuoteResponse> {
    return this.sendRequest<AusPostPriceQuoteResponse>("/prices/shipments", {
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
   * With `wait_for_label_url: true` the response includes a signed URL directly.
   * This is the call that triggers AusPost billing.
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
   * GET /track/{tracking_ids} — tracking events for up to 10 tracking IDs in one call.
   * Returns array of tracking_results — one per ID. Missing IDs are surfaced as errors.
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
   * Once manifested at the counter or via POST /orders, this call returns 4xx
   * and refund must be done via the MyPost Business portal.
   */
  async cancelShipment(shipmentId: string): Promise<void> {
    await this.sendRequest<unknown>(
      `/shipments/${encodeURIComponent(shipmentId)}`,
      { method: "DELETE" }
    )
  }

  /**
   * Smoke test for system-health: invokes the auth flow + a no-op token call.
   * Returns true on success, false on any failure (does not throw).
   */
  async ping(): Promise<boolean> {
    try {
      await this.getAccessToken()
      return true
    } catch {
      return false
    }
  }
}

// Convenience re-export so callers can `import { AusPostCreatedShipment } from "./client"`.
export type { AusPostCreatedShipment } from "./types"
