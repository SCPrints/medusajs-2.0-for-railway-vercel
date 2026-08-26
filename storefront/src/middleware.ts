import { HttpTypes } from "@medusajs/types"
import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
const PUBLISHABLE_API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"

const regionMapCache = {
  regionMap: new Map<string, HttpTypes.StoreRegion>(),
  regionMapUpdated: Date.now(),
}

async function getRegionMap() {
  const { regionMap, regionMapUpdated } = regionMapCache

  if (
    !regionMap.keys().next().value ||
    regionMapUpdated < Date.now() - 3600 * 1000
  ) {
    // This runs on EVERY request, so it must never throw: an unguarded fetch/parse
    // here turns a backend restart (Fly runs a single machine + a migrate release
    // command) into a site-wide HTTP 500, which is what Search Console reported as
    // "Server error (5xx)" on 2026-08-24. On failure we keep serving the stale map;
    // `regionMapUpdated` is deliberately left untouched so the next request retries.
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
      console.error("middleware: /store/regions fetch failed", error)
    }
  }

  if (!regionMapCache.regionMap.size) {
    // Cold instance + backend down: serve a minimal map so the request proceeds to
    // the page (whose own error boundary handles it). Returning an empty map would
    // make the redirect below target the same URL — an infinite 307 loop.
    // ponytail: not cached, so a healthy backend repopulates on the next request.
    return new Map([[DEFAULT_REGION, {} as HttpTypes.StoreRegion]])
  }

  return regionMapCache.regionMap
}

/**
 * Fetches regions from Medusa and sets the region cookie.
 * @param request
 * @param response
 */
async function getCountryCode(
  request: NextRequest,
  regionMap: Map<string, HttpTypes.StoreRegion | number>
) {
  try {
    let countryCode

    const vercelCountryCode = request.headers
      .get("x-vercel-ip-country")
      ?.toLowerCase()

    const urlCountryCode = request.nextUrl.pathname.split("/")[1]?.toLowerCase()

    if (urlCountryCode && regionMap.has(urlCountryCode)) {
      countryCode = urlCountryCode
    } else if (vercelCountryCode && regionMap.has(vercelCountryCode)) {
      countryCode = vercelCountryCode
    } else if (regionMap.has(DEFAULT_REGION)) {
      countryCode = DEFAULT_REGION
    } else if (regionMap.keys().next().value) {
      countryCode = regionMap.keys().next().value
    }

    return countryCode
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "Middleware.ts: Error getting the country code. Did you set up regions in your Medusa Admin and define a NEXT_PUBLIC_MEDUSA_BACKEND_URL environment variable?"
      )
    }
  }
}

/**
 * Middleware to handle region selection and onboarding status.
 */
export async function middleware(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const isOnboarding = searchParams.get("onboarding") === "true"
  const cartId = searchParams.get("cart_id")
  const checkoutStep = searchParams.get("step")
  const onboardingCookie = request.cookies.get("_medusa_onboarding")
  const cartIdCookie = request.cookies.get("_medusa_cart_id")

  const regionMap = await getRegionMap()

  const countryCode = regionMap && (await getCountryCode(request, regionMap))

  const pathFirstSegment = request.nextUrl.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? ""
  const resolved = countryCode ? String(countryCode).toLowerCase() : ""
  const urlHasCountryCode = Boolean(resolved && pathFirstSegment === resolved)

  // check if one of the country codes is in the url
  if (
    urlHasCountryCode &&
    (!isOnboarding || onboardingCookie) &&
    (!cartId || cartIdCookie)
  ) {
    return NextResponse.next()
  }

  const redirectPath =
    request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname

  const queryString = request.nextUrl.search ? request.nextUrl.search : ""

  let redirectUrl = request.nextUrl.href

  let response = NextResponse.redirect(redirectUrl, 307)

  // If no country code is set, we redirect to the relevant region.
  if (!urlHasCountryCode && countryCode) {
    redirectUrl = `${request.nextUrl.origin}/${countryCode}${redirectPath}${queryString}`
    response = NextResponse.redirect(`${redirectUrl}`, 307)
  }

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
