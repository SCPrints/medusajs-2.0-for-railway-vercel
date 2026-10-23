const COUNTRY_SEGMENT = /^[a-z]{2}$/i

/**
 * Where the middleware should send a request so its path starts with exactly
 * one region country code. Returns null when the path is already fine.
 *
 * Every leading two-letter segment is treated as the country slot (no route
 * starts with a two-letter folder), and the whole run is replaced, never
 * prepended to. Prepending is what produced /us/au/... and /au/us/au/...: when
 * the region list failed to load, `au` looked unknown and got a `us` stacked on
 * top, and the next request stacked an `au` on that.
 *
 * `regions` empty means the region list couldn't be loaded: a path that already
 * carries a country is let through rather than guessed at.
 */
export function resolveCountryPath(
  pathname: string,
  regions: Set<string>,
  ipCountry: string | undefined,
  fallback: string
): string | null {
  const segments = pathname.split("/").filter(Boolean)
  let lead = 0
  while (lead < segments.length && COUNTRY_SEGMENT.test(segments[lead])) lead++
  const leading = segments.slice(0, lead).map((s) => s.toLowerCase())
  const rest = segments.slice(lead)

  if (!regions.size) {
    return lead ? null : "/" + [fallback, ...rest].join("/")
  }

  if (lead === 1 && regions.has(leading[0])) return null

  const ip = ipCountry?.toLowerCase()
  const country =
    [...leading].reverse().find((c) => regions.has(c)) ??
    (ip && regions.has(ip) ? ip : undefined) ??
    (regions.has(fallback) ? fallback : regions.values().next().value!)

  return "/" + [country, ...rest].join("/")
}
