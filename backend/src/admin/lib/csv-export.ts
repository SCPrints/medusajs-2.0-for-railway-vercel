const PAGE_SIZE = 100

export { buildCsv, downloadCsv } from "./reports/csv"

export async function fetchAllProductTags(
  listFn: (q: { limit: number; offset: number }) => Promise<{
    product_tags?: ListRow[]
    count?: number
  }>
): Promise<ListRow[]> {
  const out: ListRow[] = []
  let offset = 0
  while (true) {
    const res = await listFn({ limit: PAGE_SIZE, offset })
    const batch = res.product_tags ?? []
    out.push(...batch)
    if (batch.length === 0) {
      break
    }
    if (batch.length < PAGE_SIZE) {
      break
    }
    offset += batch.length
    if (typeof res.count === "number" && offset >= res.count) {
      break
    }
  }
  return out
}

export async function fetchAllProductTypes(
  listFn: (q: { limit: number; offset: number }) => Promise<{
    product_types?: ListRow[]
    count?: number
  }>
): Promise<ListRow[]> {
  const out: ListRow[] = []
  let offset = 0
  while (true) {
    const res = await listFn({ limit: PAGE_SIZE, offset })
    const batch = res.product_types ?? []
    out.push(...batch)
    if (batch.length === 0) {
      break
    }
    if (batch.length < PAGE_SIZE) {
      break
    }
    offset += batch.length
    if (typeof res.count === "number" && offset >= res.count) {
      break
    }
  }
  return out
}

export async function fetchAllPaginated<TItem, TQuery extends { limit: number; offset: number }>(
  listFn: (q: TQuery) => Promise<{ count?: number } & Record<string, unknown>>,
  collectionKey: string,
  baseQuery: Omit<TQuery, "limit" | "offset"> = {} as Omit<TQuery, "limit" | "offset">,
  pageSize: number = PAGE_SIZE
): Promise<TItem[]> {
  const out: TItem[] = []
  let offset = 0
  while (true) {
    const query = { ...baseQuery, limit: pageSize, offset } as TQuery
    const res = await listFn(query)
    const batch = (res[collectionKey] as TItem[] | undefined) ?? []
    out.push(...batch)
    if (batch.length === 0) {
      break
    }
    if (batch.length < pageSize) {
      break
    }
    offset += batch.length
    if (typeof res.count === "number" && offset >= res.count) {
      break
    }
  }
  return out
}
