/**
 * True when an SVG contains live (non-outlined) text: a <text> element with
 * visible characters. The server print render (Sharp/librsvg) doesn't have the
 * customer's fonts, so live text falls back to another font and changes size.
 * Text inside <defs>, <metadata>, <title>, <desc> and comments is ignored.
 *
 * ponytail: regex, not a DOM parse — runs in node (jest) and the browser alike;
 * good enough for a non-blocking warning.
 */
export const svgHasLiveText = (svg: string): boolean => {
  const body = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<((?:[\w-]+:)?(?:defs|metadata|title|desc))\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")

  const textEl = /<(?:[\w-]+:)?text\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?text\s*>/gi
  let match: RegExpExecArray | null
  while ((match = textEl.exec(body))) {
    const inner = match[1]
      .replace(/<[^>]*>/g, "")
      .replace(/&(?:nbsp|#160|#xa0);/gi, " ")
    if (inner.trim()) return true
  }
  return false
}
