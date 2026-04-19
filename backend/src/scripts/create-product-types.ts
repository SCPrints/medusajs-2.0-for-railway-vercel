import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const TYPE_NAMES = [
  "Accessories",
  "Aprons",
  "Bags",
  "Belts",
  "Gadgets",
  "Headwear",
  "Hoodies",
  "Jackets",
  "Kids",
  "Longsleeves",
  "Overalls",
  "Pants",
  "Polos",
  "Shirts",
  "Shorts",
  "Singlets / Tanks",
  "Socks",
  "Stickers",
  "Sweatshirts",
  "T-Shirts",
  "Trackpants",
  "Underwear",
]

type ProductTypeInput = { value: string }
type ProductType = { id: string; value: string }

export default async function createProductTypes({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModuleService = container.resolve(Modules.PRODUCT) as {
    listProductTypes?: (...args: any[]) => Promise<ProductType[]>
    createProductTypes?: (data: ProductTypeInput[]) => Promise<ProductType[]>
  }

  if (
    typeof productModuleService.listProductTypes !== "function" ||
    typeof productModuleService.createProductTypes !== "function"
  ) {
    throw new Error(
      "Product module methods not available: expected listProductTypes/createProductTypes"
    )
  }

  const existing = await productModuleService.listProductTypes({})
  const existingByValue = new Map(existing.map((t) => [t.value.toLowerCase(), t]))

  const toCreate = TYPE_NAMES.filter((name) => !existingByValue.has(name.toLowerCase()))
  if (toCreate.length) {
    await productModuleService.createProductTypes(
      toCreate.map((value) => ({ value }))
    )
  }

  const refreshed = await productModuleService.listProductTypes({})
  const outputRows = TYPE_NAMES.map((name) => {
    const match = refreshed.find((t) => t.value.toLowerCase() === name.toLowerCase())
    return `${name}\t${match?.id ?? "MISSING"}`
  })

  logger.info(`Product types ensured: ${TYPE_NAMES.length}`)
  logger.info(`Created: ${toCreate.length}`)
  logger.info("Name -> ID")
  for (const row of outputRows) {
    logger.info(row)
  }
}
