import { expect, test, type Page } from "@playwright/test"

import fixtures from "./fixtures/past-designs.json"
import { BACKEND_URL, emptyCart, makeImage, prepareContext, PUBLISHABLE_KEY, studioCanvas, studioObjects, TEST_HANDLE } from "./helpers"

/**
 * Real past order designs (anonymised: geometry only — see
 * tools/anonymise-past-designs.mjs) must reopen where the customer put them.
 * Saved designs don't record their canvas size; the only ground truth is the
 * print area, which is centred, so the authoring canvas was
 * `2·printArea.x + printArea.width` wide on a 4:5 frame.
 */
const FRAME_ASPECT = 5 / 4
const headers = () => ({ "x-publishable-api-key": PUBLISHABLE_KEY, "content-type": "application/json" })

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BACKEND_URL}${path}`, { ...init, headers: headers() })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

let regionId = ""
let variantId = ""
let productId = ""

test.beforeAll(async () => {
  test.skip(!PUBLISHABLE_KEY, "needs STUDIO_PUBLISHABLE_KEY to build test carts")
  const { regions } = await api("/store/regions?fields=id,countries.iso_2")
  regionId = regions.find((r: any) => (r.countries ?? []).some((c: any) => c.iso_2 === "au"))?.id
  const { products } = await api(
    `/store/products?handle=${TEST_HANDLE}&fields=id,variants.id,+variants.inventory_quantity,variants.manage_inventory,variants.allow_backorder&region_id=${regionId}`
  )
  productId = products[0].id
  const variant = products[0].variants.find(
    (v: any) => !v.manage_inventory || v.allow_backorder || (v.inventory_quantity ?? 0) > 5
  )
  if (!variant) throw new Error(`${TEST_HANDLE} has no variant in stock`)
  variantId = variant.id
})

test.beforeEach(async ({ context }) => {
  await prepareContext(context)
})

test.afterEach(async ({ context }) => {
  await emptyCart(context)
})

/**
 * Swap `fixture:<w>x<h>` image srcs for hosted solid blocks of that size (cart
 * lines can't carry inline images — the real Studio uploads them too).
 * Uploaded once per size per run.
 */
const hosted = new Map<string, Promise<string>>()
async function materialise(page: Page, design: any) {
  const keys = new Set<string>()
  JSON.stringify(design, (_k, v) => (typeof v === "string" && v.startsWith("fixture:") ? (keys.add(v), v) : v))
  for (const key of keys) {
    if (hosted.has(key)) continue
    const [w, h] = key.slice(8).split("x").map(Number)
    hosted.set(
      key,
      (async () => {
        const png = await makeImage(page, { width: w, height: h })
        const res = await api("/store/customizer/upload-original", {
          method: "POST",
          body: JSON.stringify({ fileName: `fixture-${w}x${h}.png`, mimeType: "image/png", dataBase64: png.toString("base64") }),
        })
        return res.url as string
      })()
    )
  }
  const urls: Record<string, string> = {}
  for (const key of keys) urls[key] = await hosted.get(key)!
  return JSON.parse(JSON.stringify(design), (_k, v) => (typeof v === "string" && urls[v] ? urls[v] : v))
}

/** Top-left of an unrotated saved object, in saved-canvas px. */
function savedBox(o: any) {
  const w = (o.width ?? 0) * Math.abs(o.scaleX ?? 1)
  const h = (o.height ?? 0) * Math.abs(o.scaleY ?? 1)
  const left = o.originX === "center" ? o.left - w / 2 : o.originX === "right" ? o.left - w : o.left
  const top = o.originY === "center" ? o.top - h / 2 : o.originY === "bottom" ? o.top - h : o.top
  return { left, top, width: w, height: h }
}

/**
 * Real bugs these fixtures expose. `test.fail` keeps the suite green and turns
 * red the moment one is fixed, so the entry gets removed.
 */
const KNOWN_BROKEN: Record<string, string> = {
  // (empty) past-design-02 — mixed per-side print sizes — fixed 2026-10-29 by
  // savedCanvasSize (print-geometry.ts): reopen no longer trusts scpPrintSizeId.
}

for (const fixture of fixtures as any[]) {
  test(`reopens in place: ${fixture.name}`, async ({ page, context, baseURL }) => {
    const known = KNOWN_BROKEN[fixture.name.split(" ")[0]]
    test.fail(!!known, known)
    await page.goto("/au")
    const design = await materialise(page, { ...fixture.design, productId, variantId })

    const { cart } = await api("/store/carts", { method: "POST", body: JSON.stringify({ region_id: regionId }) })
    const added = await api(`/store/carts/${cart.id}/line-items`, {
      method: "POST",
      body: JSON.stringify({ variant_id: variantId, quantity: 1, metadata: { customizerDesign: design } }),
    })
    const line = added.cart.items.find((i: any) => i.metadata?.customizerDesign)
    await context.addCookies([{ name: "_medusa_cart_id", value: cart.id, url: baseURL! }])

    const side = design.activeSide ?? "front"
    const saved = (design.sideLayouts.find((s: any) => s.side === side)?.objects ?? []) as any[]
    await page.goto(`/au/products/${TEST_HANDLE}?edit=${line.id}`)
    await expect.poll(async () => (await page.evaluate(() => (window as any).__scpStudio?.objects().length ?? 0)), {
      timeout: 60_000,
    }).toBe(saved.length)

    const now = await studioObjects(page)
    const { width: cw, height: ch } = await studioCanvas(page)
    const savedW = 2 * design.printArea.x + design.printArea.width
    const savedH = savedW * FRAME_ASPECT

    saved.forEach((o, i) => {
      if (Math.abs(o.angle ?? 0) > 0.5) return // rotated: bounding box isn't comparable
      const s = savedBox(o)
      const r = now[i].scene
      const label = `${fixture.name} object ${i + 1} (${o.type})`
      // Same spot on the garment, as a fraction of the frame.
      expect(Math.abs(r.left / cw - s.left / savedW), `${label} left`).toBeLessThan(0.025)
      expect(Math.abs(r.top / ch - s.top / savedH), `${label} top`).toBeLessThan(0.025)
      // Not stretched (text width depends on the placeholder text, so skip it).
      if (!/text/i.test(o.type) && s.height > 0 && r.height > 0) {
        expect(Math.abs(r.width / r.height / (s.width / s.height) - 1), `${label} aspect`).toBeLessThan(0.03)
      }
    })
  })
}
