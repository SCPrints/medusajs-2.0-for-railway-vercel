/** Map manifest hex colors to site CSS variables (custom apparel / services JSON). */
export function themedSvgMarkup(svgContent: string) {
  return svgContent
    .replace(/#1A365D/gi, "var(--brand-primary)")
    .replace(/#38B2AC/gi, "var(--brand-accent)")
}
