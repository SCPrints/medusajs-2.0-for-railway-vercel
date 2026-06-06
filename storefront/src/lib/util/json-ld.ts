/**
 * Serialise an object for embedding inside a
 * `<script type="application/ld+json">` via dangerouslySetInnerHTML.
 *
 * JSON.stringify does NOT escape `<`, `>`, or `&`, so a value containing
 * `</script>` — e.g. a supplier-written or AI-drafted product title/description
 * — could break out of the script tag and inject arbitrary markup (stored XSS).
 * Escaping those three characters to their \uXXXX forms keeps the JSON valid
 * (the browser's JSON parser decodes them back) while making a `</script>`
 * breakout impossible. The content is parsed as JSON (not JS), so the
 * U+2028/U+2029 escaping needed for inline JS is not required here.
 *
 * Use this anywhere product/user-controlled data is embedded in JSON-LD.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
}
