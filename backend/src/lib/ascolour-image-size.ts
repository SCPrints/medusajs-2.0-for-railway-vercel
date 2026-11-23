/**
 * AS Colour's API gives each photo at 1280×1280 (`urlZoom`) and 386×513
 * (`urlStandard`). BigCommerce serves the 386×513 resize unreliably: 404 at the
 * origin, 200 only from Cloudflare edges that still hold an old copy, so a
 * product carrying it shows a broken photo to some visitors and passes the
 * liveness check from others (5086 Faded Brown, 2026-11-23). AS Colour also
 * re-shoots colours under new image ids, and the old photo's 1280 link then
 * 404s too, so the swap must come from the API, not from editing the URL.
 *
 * Returns the API's full-size link for a 386×513 link: the same image id first,
 * else the current photo of the same shot (colour + view, the filename before
 * `__`). Null for any other URL or when the API has no match.
 */
const SMALL = /^https:\/\/cdn11\.bigcommerce\.com\/.+\.386\.513\.(jpe?g|png|webp)(\?|$)/i

/** A 386×513 link: never trust it as a colour's photo, it may 404 for visitors. */
export const isSmallAsColourUrl = (url: string) => SMALL.test(url)

const imageId = (url: string) => url.match(/\/images\/(\d+)\//)?.[1]
export const shotKey = (url: string) =>
  (url.split("?")[0].split("/").pop() ?? "").split("__")[0].toUpperCase()

export const fullSizeAsColourUrl = (
  url: string,
  apiImages: Array<{ urlZoom?: string | null }>
): string | null => {
  if (!SMALL.test(url)) return null
  const zooms = apiImages.map((i) => i.urlZoom).filter((z): z is string => !!z)
  return (
    zooms.find((z) => imageId(z) === imageId(url)) ??
    zooms.find((z) => shotKey(z) === shotKey(url)) ??
    null
  )
}
