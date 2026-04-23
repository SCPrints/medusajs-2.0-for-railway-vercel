import { revalidateTag } from "next/cache"
import { type NextRequest, NextResponse } from "next/server"

/**
 * On-demand cache purge for product catalog fetches (tag: `products` in @lib/data/products).
 * Set REVALIDATE_SECRET in Vercel env, then after backend catalog changes (e.g. trim script):
 *   curl -X POST "https://<storefront>/api/revalidate-products" -H "Authorization: Bearer <REVALIDATE_SECRET>"
 * Or: ?secret=<REVALIDATE_SECRET>
 */
export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET
  if (!expected?.trim()) {
    return NextResponse.json(
      { message: "REVALIDATE_SECRET is not set on the storefront" },
      { status: 503 }
    )
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim()
  const q = request.nextUrl.searchParams.get("secret")?.trim()
  const provided = bearer || q

  if (provided !== expected) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  revalidateTag("products")

  return NextResponse.json({ revalidated: true, tag: "products" })
}
