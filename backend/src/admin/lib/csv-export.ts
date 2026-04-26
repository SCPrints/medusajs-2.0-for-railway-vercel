const PAGE_SIZE = 100

export const escapeCsvCell = (value: string): string => {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export const buildCsv = (header: string[], rows: string[][]): string => {
  const lines = [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ]
  return lines.join("\n") + "\n"
}

export const downloadCsv = (filename: string, csvBody: string) => {
  const blob = new Blob([csvBody], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type ListRow = { id: string; value: string }

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
