import { Logger } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { FashionBizClient } from "./client"
import {
  FashionBizBrandSlug,
  FashionBizOptions,
  FashionBizProduct,
  FashionBizProductStub,
  FashionBizStockResponse,
} from "./types"

type InjectedDependencies = {
  logger: Logger
}

export default class FashionBizService {
  static identifier = "fashionbiz"
  protected options_: FashionBizOptions
  protected client_: FashionBizClient
  protected logger_: Logger

  constructor({ logger }: InjectedDependencies, options: FashionBizOptions) {
    this.options_ = options
    this.client_ = new FashionBizClient(options)
    this.logger_ = logger
  }

  static validateOptions(options: Record<string, any>) {
    const required = ["token", "branch", "base_url"]
    for (const key of required) {
      if (!options?.[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `FashionBiz module is missing required option: ${key}`
        )
      }
    }
  }

  getClient(): FashionBizClient {
    return this.client_
  }

  getOptions(): FashionBizOptions {
    return this.options_
  }

  /**
   * Effective cost multiplier — clamped to a positive finite number to defend
   * against env-var typos that would otherwise zero out every price.
   */
  getCostAdjustment(): number {
    const raw = this.options_.cost_adjustment
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return 1.0
    return raw
  }

  async fetchAllProductsForBrand(brand: FashionBizBrandSlug): Promise<FashionBizProductStub[]> {
    const resp = await this.client_.getSimpleProductList(brand)
    return resp.products ?? []
  }

  /**
   * Walks the paginated /products/{brand}/{branch}/ endpoint and returns the
   * full set of FashionBizProduct rows. Each row carries `sales_status`,
   * `prices`, `colors`, etc. — fields the /simple/ endpoint omits.
   *
   * Throttled to ~5 req/sec to stay below FashionBiz's (undocumented) rate
   * limit. Caller is responsible for cache management — this method always
   * hits the network.
   */
  async fetchAllProductsWithDetail(
    brand: FashionBizBrandSlug
  ): Promise<FashionBizProduct[]> {
    const out: FashionBizProduct[] = []
    let page = 1
    // Hard cap defends against pagination loops on a malformed API response.
    for (let safety = 0; safety < 500; safety++) {
      const resp = await this.client_.getProductListPage(brand, page)
      out.push(...(resp.products ?? []))
      if (!resp.next || resp.products?.length === 0) break
      page = resp.next
      await new Promise((r) => setTimeout(r, 200))
    }
    return out
  }

  async fetchProductDetail(
    brand: FashionBizBrandSlug,
    slug: string
  ): Promise<FashionBizProduct> {
    return this.client_.getProductDetail(brand, slug)
  }

  async fetchStock(
    brand: FashionBizBrandSlug,
    slug: string,
    colour: string
  ): Promise<FashionBizStockResponse> {
    return this.client_.getStock(brand, slug, colour)
  }
}
