export type ProductFilters = {
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  brand?: string
  fabric?: string
  /** Medusa product type id (`ptype_*`) */
  typeId?: string
  /** Medusa product tag id (`ptag_*`) */
  tagId?: string
}

export type CatalogFacetOption = {
  id: string
  label: string
}

export type CatalogFacetOptions = {
  brands: CatalogFacetOption[]
  types: CatalogFacetOption[]
  tags: CatalogFacetOption[]
}
