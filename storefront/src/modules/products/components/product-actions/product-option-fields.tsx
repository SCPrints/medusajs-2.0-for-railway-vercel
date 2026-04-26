"use client"

import { HttpTypes } from "@medusajs/types"

import Accordion from "@modules/products/components/product-tabs/accordion"

import OptionSelect from "./option-select"

type ProductOptionFieldsProps = {
  product: HttpTypes.StoreProduct
  options: Record<string, string | undefined>
  updateOption: (title: string, value: string) => void
  disabled: boolean
  showSizeQuantityInputs?: boolean
  /** Embedded customizer: size + quantities live in the pricing panel. */
  hideSizeOption?: boolean
  "data-testid"?: string
}

const optionItemValue = (option: HttpTypes.StoreProductOption) => {
  if (typeof option.id === "string" && option.id.length > 0) {
    return option.id
  }
  if (option.id != null) {
    return String(option.id)
  }
  return option.title ?? "option"
}

const isSizeOptionTitle = (title: string) => title.toLowerCase().includes("size")

export default function ProductOptionFields({
  product,
  options,
  updateOption,
  disabled,
  showSizeQuantityInputs = true,
  hideSizeOption = false,
  "data-testid": dataTestId,
}: ProductOptionFieldsProps) {
  const productOptions = (product.options ?? []).filter(
    (o) => !(hideSizeOption && isSizeOptionTitle(o.title ?? ""))
  )
  if (productOptions.length === 0) {
    return null
  }
  const defaultOpen = productOptions.map(optionItemValue)

  return (
    <div className="w-full">
      <Accordion type="multiple" defaultValue={defaultOpen}>
        {productOptions.map((option) => {
          const value = optionItemValue(option)
          const title = option.title ?? ""
          const selected = options[title]
          return (
            <Accordion.Item
              key={value}
              value={value}
              title={`Select ${title}`}
              subtitle={selected}
              headingSize="medium"
            >
              <OptionSelect
                product={product}
                option={option}
                current={selected}
                updateOption={updateOption}
                title={title}
                disabled={disabled}
                showSizeQuantityInputs={showSizeQuantityInputs}
                data-testid={dataTestId}
              />
            </Accordion.Item>
          )
        })}
      </Accordion>
    </div>
  )
}
