import { slugify } from "../utils/string-case"

/**
 * Product handle for an AS Colour style: `as-colour-<readable-name>-<code>`.
 *
 * `name` is the API `styleName` (importer) or our stored title (rename
 * script). AS Colour abbreviates ("Wo's Maple L/S Tee | 4020") and sometimes
 * puts the code at either end of the name, so expand + strip before slugging
 * or the URL reads "wo-s-maple-l-s-tee-4020-4020".
 */
export const asColourHandle = (name: string | undefined, styleCode: string): string => {
  const code = String(styleCode ?? "").trim()
  const codeRe = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const cleaned = String(name ?? "")
    .replace(new RegExp(`^${codeRe}\\s*[-|:]?\\s*`, "i"), "")
    .replace(new RegExp(`\\s*[-|:]?\\s*${codeRe}$`, "i"), "")
    .replace(/\bwo'?s\b/gi, "womens")
    .replace(/\bl\/s\b/gi, "long sleeve")
    .replace(/\bs\/s\b/gi, "short sleeve")
    .trim()
  return `as-colour-${slugify(`${cleaned || "product"}-${code}`)}`
}
