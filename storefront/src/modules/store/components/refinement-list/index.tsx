"use client"

import { ChevronUpDown } from "@medusajs/icons"
import { Button, Input, Text, clx } from "@medusajs/ui"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"

import SortProducts, { SortOptions } from "./sort-products"
import { CatalogFacetOptions, ProductFilters } from "./types"

function FacetSelect({
  placeholder,
  value,
  onChange,
  children,
}: {
  placeholder: string
  value: string
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
  children: React.ReactNode
}) {
  return (
    <div
      className={clx(
        "relative flex items-center text-base-regular border border-ui-border-base bg-ui-bg-subtle rounded-md hover:bg-ui-bg-field-hover",
        !value ? "text-ui-fg-muted" : undefined
      )}
    >
      <select
        value={value}
        onChange={onChange}
        className="appearance-none flex-1 bg-transparent border-none px-4 py-2.5 transition-colors duration-150 outline-none"
      >
        <option disabled value="">
          {placeholder}
        </option>
        {children}
      </select>
      <span className="absolute right-4 inset-y-0 flex items-center pointer-events-none">
        <ChevronUpDown />
      </span>
    </div>
  )
}

type RefinementListProps = {
  sortBy: SortOptions
  filters?: ProductFilters
  /** When set (store page), brand/type/tag use dropdowns populated server-side */
  facetOptions?: CatalogFacetOptions
  search?: boolean
  "data-testid"?: string
}

const RefinementList = ({
  sortBy,
  filters,
  facetOptions,
  "data-testid": dataTestId,
}: RefinementListProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [minPriceInput, setMinPriceInput] = useState(
    typeof filters?.minPrice === "number" ? String(filters.minPrice) : ""
  )
  const [maxPriceInput, setMaxPriceInput] = useState(
    typeof filters?.maxPrice === "number" ? String(filters.maxPrice) : ""
  )
  const [brandInput, setBrandInput] = useState(filters?.brand ?? "")
  const [fabricInput, setFabricInput] = useState(filters?.fabric ?? "")
  const [typeIdInput, setTypeIdInput] = useState(filters?.typeId ?? "")
  const [tagIdInput, setTagIdInput] = useState(filters?.tagId ?? "")

  useEffect(() => {
    setMinPriceInput(typeof filters?.minPrice === "number" ? String(filters.minPrice) : "")
    setMaxPriceInput(typeof filters?.maxPrice === "number" ? String(filters.maxPrice) : "")
    setBrandInput(filters?.brand ?? "")
    setFabricInput(filters?.fabric ?? "")
    setTypeIdInput(filters?.typeId ?? "")
    setTagIdInput(filters?.tagId ?? "")
  }, [
    filters?.minPrice,
    filters?.maxPrice,
    filters?.brand,
    filters?.fabric,
    filters?.typeId,
    filters?.tagId,
  ])

  const brandChoices = useMemo(() => {
    if (!facetOptions) {
      return []
    }
    const base = facetOptions.brands
    const b = filters?.brand?.trim()
    if (b && !base.some((x) => x.id === b)) {
      return [...base, { id: b, label: b }]
    }
    return base
  }, [facetOptions, filters?.brand])

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
    const normalizedTypeId = typeIdInput.trim() || undefined
    const normalizedTagId = tagIdInput.trim() || undefined

    const query = createQueryString({
      minPrice: normalizedMinPrice,
      maxPrice: normalizedMaxPrice,
      brand: normalizedBrand,
      fabric: normalizedFabric,
      typeId: normalizedTypeId,
      tagId: normalizedTagId,
      tag: undefined,
    })

    router.push(`${pathname}?${query}`)
  }

  const clearFilters = () => {
    setMinPriceInput("")
    setMaxPriceInput("")
    setBrandInput("")
    setFabricInput("")
    setTypeIdInput("")
    setTagIdInput("")

    const query = createQueryString({
      minPrice: undefined,
      maxPrice: undefined,
      brand: undefined,
      fabric: undefined,
      typeId: undefined,
      tagId: undefined,
      tag: undefined,
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

        {facetOptions ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Text className="txt-compact-small text-ui-fg-muted">Brand</Text>
              <FacetSelect
                value={brandInput}
                onChange={(event) => setBrandInput(event.target.value)}
                placeholder="All brands"
              >
                {brandChoices.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </FacetSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Text className="txt-compact-small text-ui-fg-muted">Type</Text>
              <FacetSelect
                value={typeIdInput}
                onChange={(event) => setTypeIdInput(event.target.value)}
                placeholder="All types"
              >
                {facetOptions.types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </FacetSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Text className="txt-compact-small text-ui-fg-muted">Tag</Text>
              <FacetSelect
                value={tagIdInput}
                onChange={(event) => setTagIdInput(event.target.value)}
                placeholder="All tags"
              >
                {facetOptions.tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </FacetSelect>
            </div>
          </>
        ) : (
          <Input
            type="text"
            placeholder="Brand (e.g. AS Colour)"
            value={brandInput}
            onChange={(event) => setBrandInput(event.target.value)}
          />
        )}

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
