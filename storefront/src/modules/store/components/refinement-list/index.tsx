"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState } from "react"
import { Button, Checkbox, Input, Text } from "@medusajs/ui"

import SortProducts, { SortOptions } from "./sort-products"
import { ProductFilters } from "./types"

type RefinementListProps = {
  sortBy: SortOptions
  filters?: ProductFilters
  search?: boolean
  'data-testid'?: string
}

const RefinementList = ({ sortBy, filters, 'data-testid': dataTestId }: RefinementListProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [minPriceInput, setMinPriceInput] = useState(
    typeof filters?.minPrice === "number" ? String(filters.minPrice) : ""
  )
  const [maxPriceInput, setMaxPriceInput] = useState(
    typeof filters?.maxPrice === "number" ? String(filters.maxPrice) : ""
  )
  const [inStockOnly, setInStockOnly] = useState(Boolean(filters?.inStock))
  const [brandInput, setBrandInput] = useState(filters?.brand ?? "")
  const [fabricInput, setFabricInput] = useState(filters?.fabric ?? "")

  const createQueryString = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams)

      Object.entries(updates).forEach(([name, value]) => {
        if (value === undefined || value === "") {
          params.delete(name)
        } else {
          params.set(name, value)
        }
      })

      // Reset to first page when sorting/filtering changes.
      params.delete("page")

      return params.toString()
    },
    [searchParams]
  )

  const setSortQueryParam = (name: string, value: string) => {
    const query = createQueryString({ [name]: value })
    router.push(`${pathname}?${query}`)
  }

  const applyFilters = () => {
    const minPrice = minPriceInput.trim()
    const maxPrice = maxPriceInput.trim()

    const normalizedMinPrice =
      minPrice && Number.isFinite(Number(minPrice)) && Number(minPrice) >= 0
        ? String(Math.floor(Number(minPrice)))
        : undefined
    const normalizedMaxPrice =
      maxPrice && Number.isFinite(Number(maxPrice)) && Number(maxPrice) >= 0
        ? String(Math.floor(Number(maxPrice)))
        : undefined
    const normalizedBrand = brandInput.trim() || undefined
    const normalizedFabric = fabricInput.trim() || undefined

    const query = createQueryString({
      minPrice: normalizedMinPrice,
      maxPrice: normalizedMaxPrice,
      inStock: inStockOnly ? "1" : undefined,
      brand: normalizedBrand,
      fabric: normalizedFabric,
    })

    router.push(`${pathname}?${query}`)
  }

  const clearFilters = () => {
    setMinPriceInput("")
    setMaxPriceInput("")
    setInStockOnly(false)
    setBrandInput("")
    setFabricInput("")

    const query = createQueryString({
      minPrice: undefined,
      maxPrice: undefined,
      inStock: undefined,
      brand: undefined,
      fabric: undefined,
    })

    router.push(`${pathname}?${query}`)
  }

  return (
    <div className="flex small:flex-col gap-12 py-4 mb-8 small:px-0 pl-6 small:min-w-[250px] small:ml-[1.675rem]">
      <SortProducts
        sortBy={sortBy}
        setQueryParams={setSortQueryParam}
        data-testid={dataTestId}
      />

      <div className="flex flex-col gap-3">
        <Text className="txt-compact-small-plus text-ui-fg-muted">Filter by</Text>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Min price"
            value={minPriceInput}
            onChange={(event) => setMinPriceInput(event.target.value)}
          />
          <Input
            type="number"
            min={0}
            placeholder="Max price"
            value={maxPriceInput}
            onChange={(event) => setMaxPriceInput(event.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ui-fg-subtle">
          <Checkbox
            checked={inStockOnly}
            onCheckedChange={(checked) => setInStockOnly(Boolean(checked))}
          />
          In stock only
        </label>

        <Input
          type="text"
          placeholder="Brand (e.g. AS Colour)"
          value={brandInput}
          onChange={(event) => setBrandInput(event.target.value)}
        />
        <Input
          type="text"
          placeholder="Fabric (e.g. cotton)"
          value={fabricInput}
          onChange={(event) => setFabricInput(event.target.value)}
        />

        <div className="flex gap-2 pt-1">
          <Button type="button" size="small" onClick={applyFilters}>
            Apply
          </Button>
          <Button type="button" size="small" variant="secondary" onClick={clearFilters}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  )
}

export default RefinementList
