export type NameColumn = "tag_name" | "type_name"

const parseCsvLine = (line: string): string[] => {
  const out: string[] = []
  let value = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        value += "\""
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === "," && !inQuotes) {
      out.push(value)
      value = ""
      continue
    }
    value += ch
  }
  out.push(value)
  return out
}

const splitCsvRecords = (raw: string): string[] => {
  const records: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '"') {
      if (inQuotes && raw[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
        current += ch
      }
      continue
    }
    if (!inQuotes) {
      if (ch === "\n") {
        if (current.length > 0 || records.length > 0) {
          records.push(current)
        }
        current = ""
        continue
      }
      if (ch === "\r") {
        if (raw[i + 1] === "\n") {
          i++
        }
        if (current.length > 0 || records.length > 0) {
          records.push(current)
        }
        current = ""
        continue
      }
    }
    current += ch
  }
  if (current.length > 0 || records.length > 0) {
    records.push(current)
  }
  return records.filter((r) => r.trim().length > 0)
}

export type ParsedCsv = {
  headers: string[]
  rows: Record<string, string>[]
}

/** First row = headers (normalized to lowercase trimmed keys). */
export const parseCsv = (text: string): ParsedCsv => {
  const lines = splitCsvRecords(text.trim().length ? text : "")
  if (!lines.length) {
    return { headers: [], rows: [] }
  }
  const headerParts = parseCsvLine(lines[0])
  const headers = headerParts.map((h) => h.trim().toLowerCase()).filter(Boolean)
  const rows = lines.slice(1).map((line) => {
    const parts = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((header, idx) => {
      row[header] = (parts[idx] ?? "").trim()
    })
    return row
  })
  return { headers, rows }
}

/**
 * Ordered unique names (by first occurrence), case-insensitive dedupe within file.
 */
export const extractNamesFromRows = (
  parsed: ParsedCsv,
  column: NameColumn
): { names: string[]; error: string | null } => {
  const key = column.toLowerCase()
  const { headers, rows } = parsed
  if (!headers.length) {
    return { names: [], error: "CSV is empty." }
  }
  if (!headers.includes(key)) {
    return {
      names: [],
      error: `Missing required column "${column}" in CSV header.`,
    }
  }
  if (!rows.length) {
    return { names: [], error: "CSV has no data rows (header only)." }
  }
  const seen = new Set<string>()
  const names: string[] = []
  for (const row of rows) {
    const raw = (row[key] ?? "").trim()
    if (!raw) {
      continue
    }
    const lower = raw.toLowerCase()
    if (seen.has(lower)) {
      continue
    }
    seen.add(lower)
    names.push(raw)
  }
  return { names, error: null }
}
