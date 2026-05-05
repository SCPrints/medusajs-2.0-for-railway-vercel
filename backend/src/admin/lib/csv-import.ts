export type NameColumn = "tag_name" | "type_name"

export const parseCsvLine = (line: string): string[] => {
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

export const splitCsvRecords = (raw: string): string[] => {
  const records: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '"') {
      /**
       * Preserve quotes verbatim — record-splitting only needs to know whether we're inside a quoted
       * cell so newlines don't end the record. Quote-escape translation is parseCsvLine's job. If we
       * also unescape here, the second pass mis-reads JSON cells like `"{""k"":1}"` as `{k:1}`.
       */
      if (inQuotes && raw[i + 1] === '"') {
        current += '""'
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
  /** 1-based column numbers whose header text is blank (for UX warnings). */
  emptyHeaderColumns: number[]
}

/** First row = headers (normalized to lowercase trimmed keys). */
export const parseCsv = (text: string): ParsedCsv => {
  const lines = splitCsvRecords(text.trim().length ? text : "")
  if (!lines.length) {
    return { headers: [], rows: [], emptyHeaderColumns: [] }
  }
  const headerParts = parseCsvLine(lines[0].replace(/^\ufeff/, ""))
  const headers = headerParts.map((h) =>
    h.trim().replace(/^\ufeff/, "").toLowerCase()
  )
  const emptyHeaderColumns: number[] = []
  headers.forEach((h, idx) => {
    if (h === "") {
      emptyHeaderColumns.push(idx + 1)
    }
  })
  const rows = lines.slice(1).map((line) => {
    const parts = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((header, idx) => {
      row[header] = (parts[idx] ?? "").trim()
    })
    return row
  })
  return { headers, rows, emptyHeaderColumns }
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
