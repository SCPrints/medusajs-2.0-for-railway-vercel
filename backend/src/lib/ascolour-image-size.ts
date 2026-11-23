/**
 * AS Colour's API gives each photo at 1280×1280 (`urlZoom`) and 386×513
 * (`urlStandard`). BigCommerce serves the 386×513 resize unreliably: 404 at the
 * origin, 200 only from Cloudflare edges that still hold an old copy, so a
 * product carrying it shows a broken photo to some visitors and passes the
 * liveness check from others (5086 Faded Brown, 2026-11-23).
 *
 * Returns the 1280×1280 link of the same photo, or null for any other URL.
 */
export const fullSizeAsColourUrl = (url: string): string | null =>
  /^https:\/\/cdn11\.bigcommerce\.com\/.+\.386\.513\.(jpe?g|png|webp)(\?|$)/i.test(url)
    ? url.replace(/\.386\.513\.(jpe?g|png|webp)/i, ".1280.1280.$1")
    : null
