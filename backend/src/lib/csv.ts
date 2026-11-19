/** RFC 4180 CSV with a BOM so Excel reads UTF-8. Leading = + - @ are quoted as text (formula injection). */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v)
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return "\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"
}
