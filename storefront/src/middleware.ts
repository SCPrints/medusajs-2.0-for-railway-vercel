import { HttpTypes } from "@medusajs/types"
import { NextFetchEvent, NextRequest, NextResponse } from "next/server"
import { resolveCountryPath } from "@lib/util/country-path"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
const PUBLISHABLE_API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const DEFAULT_REGION = (process.env.NEXT_PUBLIC_DEFAULT_REGION || "au").toLowerCase()

const regionMapCache = {
  regionMap: new Map<string, HttpTypes.StoreRegion>(),
  regionMapUpdated: Date.now(),
  // After a failed fetch, wait a minute before the next try: retrying on every
  // request made each visitor wait out the 5 s timeout while the backend was down
  // (Vercel: 293 timeouts across 89 visitors, Aug–Nov 2026).
  retryAfter: 0,
  refreshing: null as Promise<void> | null,
}

async function refreshRegionMap() {
  // Must never throw: an unguarded fetch/parse here turns a backend restart (Fly
  // runs a single machine + a migrate release command) into a site-wide HTTP 500,
  // which is what Search Console reported as "Server error (5xx)" on 2026-08-24.
  // On failure we keep serving the map we have.
  try {
    // Fetch regions from Medusa. We can't use the JS client here because middleware is running on Edge and the client needs a Node environment.
    const regionFetchRes = await fetch(`${BACKEND_URL}/store/regions`, {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_API_KEY!,
      },
      signal: AbortSignal.timeout(5000),
      next: {
        revalidate: 3600,
        tags: ["regions"],
      },
    })

    const { regions } = await regionFetchRes.json()

    if (regions?.length) {
      // Create a map of country codes to regions.
      regions.forEach((region: HttpTypes.StoreRegion) => {
        region.countries?.forEach((c) => {
          regionMapCache.regionMap.set(c.iso_2 ?? "", region)
        })
      })

      regionMapCache.regionMapUpdated = Date.now()
    }
  } catch (error) {
    regionMapCache.retryAfter = Date.now() + 60 * 1000
    console.error("middleware: /store/regions fetch failed", error)
  }
}

async function getRegionMap(event?: NextFetchEvent) {
  const { regionMap, regionMapUpdated, retryAfter } = regionMapCache
  const empty = !regionMap.keys().next().value
  const stale = regionMapUpdated < Date.now() - 3600 * 1000

  if ((empty || stale) && Date.now() >= retryAfter) {
    regionMapCache.refreshing ??= refreshRegionMap().finally(() => {
      regionMapCache.refreshing = null
    })
    // A cold instance has nothing to serve, so it waits; a warm one serves the
    // map it has and refreshes it in the background.
    if (empty) await regionMapCache.refreshing
    else event?.waitUntil(regionMapCache.refreshing)
  }

  // Empty when the backend is unreachable on a cold instance; resolveCountryPath
  // then lets country paths through instead of guessing (a guessed stand-in map
  // here is what stacked /us onto /au/... URLs).
  return regionMapCache.regionMap
}

/**
 * Middleware to handle region selection and onboarding status.
 */
export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const searchParams = request.nextUrl.searchParams
  const isOnboarding = searchParams.get("onboarding") === "true"
  const cartId = searchParams.get("cart_id")
  const checkoutStep = searchParams.get("step")
  const onboardingCookie = request.cookies.get("_medusa_onboarding")
  const cartIdCookie = request.cookies.get("_medusa_cart_id")

  const regionMap = await getRegionMap(event)

  const countryPath = resolveCountryPath(
    request.nextUrl.pathname,
    new Set(regionMap.keys()),
    request.headers.get("x-vercel-ip-country") ?? undefined,
    DEFAULT_REGION
  )

  if (
    !countryPath &&
    (!isOnboarding || onboardingCookie) &&
    (!cartId || cartIdCookie)
  ) {
    return NextResponse.next()
  }

  let redirectUrl = countryPath
    ? `${request.nextUrl.origin}${countryPath}${request.nextUrl.search}`
    : request.nextUrl.href

  // Permanent (308) when the shop serves one country: every visitor lands on the
  // same /au URL, and a 307 made Google keep the unprefixed URL as canonical
  // (home indexed as "/", "/au" marked duplicate — Search Console, 2026-11-06).
  // Stays 307 with several countries (IP-based choice) or an empty map (backend down).
  let response = NextResponse.redirect(
    redirectUrl,
    regionMap.size === 1 ? 308 : 307
  )

  // If a cart_id is in the params, we set it as a cookie and redirect to the address step.
  if (cartId && !checkoutStep) {
    redirectUrl = `${redirectUrl}&step=address`
    response = NextResponse.redirect(`${redirectUrl}`, 307)
    // Match setCartId's hardening (cookies.ts): httpOnly so JS can't read the
    // cart token, sameSite=strict to blunt cart-fixation via a crafted
    // `?cart_id=` link, secure in prod.
    response.cookies.set("_medusa_cart_id", cartId, {
      maxAge: 60 * 60 * 24,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    })
  }

  // Set a cookie to indicate that we're onboarding. This is used to show the onboarding flow.
  if (isOnboarding) {
    response.cookies.set("_medusa_onboarding", "true", {
      maxAge: 60 * 60 * 24,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    })
  }

  return response
}

export const config = {
  matcher: [
    // Exclude `_next/` (not only `_next/static`) so `/_next/image` is not prefixed with /{countryCode}/ — otherwise next/image requests break.
    // `offline.html`, `sw.js`, `manifest.webmanifest` excluded so the service
    // worker can pre-cache the offline fallback page without country-code
    // routing.
    // Static media extensions are excluded so the middleware doesn't prefix
    // them with /{countryCode}/ and 307-redirect them — that broke the Shaka
    // Wear hero <video> (the .mp4 was redirected to /au/images/... so the
    // <source> couldn't load and the poster showed as a static frame).
    // `robots.txt` + `sitemap.xml` excluded so crawlers get the real files —
    // country-prefixing them 307'd Google to /au/robots.txt, which renders
    // HTML (no crawl rules, sitemap never discovered).
    "/((?!api|_next/|offline\\.html|sw\\.js|manifest\\.webmanifest|favicon.ico|robots\\.txt|sitemap\\.xml|animation-lab/|.*\\.png|.*\\.jpg|.*\\.gif|.*\\.svg|.*\\.riv|.*\\.webp|.*\\.mp4|.*\\.webm|.*\\.mov).*)",
  ],
}
