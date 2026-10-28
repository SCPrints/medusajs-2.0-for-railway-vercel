import { expect, type BrowserContext, type Page } from "@playwright/test"

/** Garment every journey uses: in stock, has the size-M mockup scale (the tricky case). */
export const TEST_HANDLE = process.env.STUDIO_TEST_HANDLE ?? "as-colour-classic-tee-5026"
export const BACKEND_URL = (process.env.STUDIO_BACKEND_URL ?? "https://api.scprints.com.au").replace(/\/+$/, "")
export const PUBLISHABLE_KEY = process.env.STUDIO_PUBLISHABLE_KEY ?? ""

/** Artwork colour in every fixture — easy to find again in rendered mockups. */
export const ART_RGB = { r: 225, g: 29, b: 72 }

export type StudioObject = {
  type: string
  uploadId: string | null
  scene: { left: number; top: number; width: number; height: number }
  viewport: { x: number; y: number; width: number; height: number }
}

/**
 * Test runs must not look like customers: block analytics, and switch on the
 * Studio's read-only `window.__scpStudio` hook (see templates/index.tsx).
 */
export async function prepareContext(context: BrowserContext) {
  await context.route(/posthog|google-analytics|googletagmanager|_vercel\/insights|connect\.facebook|clarity\.ms/, (r) =>
    r.abort()
  )
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("scp:e2e", "1")
    } catch {
      /* ignore */
    }
  })
}

export async function openStudio(page: Page, handle = TEST_HANDLE) {
  await page.goto(`/au/customizer-v2?handle=${handle}`)
  await page.getByRole("button", { name: /Customise this garment/ }).click()
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__scpStudio))).toBe(true)
}

export async function openArtworkStep(page: Page) {
  const input = page.getByLabel("Upload a PNG, JPG, or SVG to add to your design")
  if (!(await input.count())) {
    await page.getByRole("button", { name: /^\+?\s*Artwork/ }).click()
  }
  return input
}

export async function uploadArtwork(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const before = (await studioObjects(page)).length
  const input = await openArtworkStep(page)
  await input.setInputFiles(file)
  await expect.poll(async () => (await studioObjects(page)).length, { timeout: 60_000 }).toBe(before + 1)
}

export const studioObjects = (page: Page): Promise<StudioObject[]> =>
  page.evaluate(() => (window as any).__scpStudio?.objects() ?? [])

export const studioCanvas = (page: Page): Promise<{
  width: number
  height: number
  visible: { x: number; y: number; width: number; height: number }
}> => page.evaluate(() => (window as any).__scpStudio.canvas())

export const studioSide = (page: Page): Promise<string> => page.evaluate(() => (window as any).__scpStudio.side())

/** Drag an object by its centre so its centre lands at (fx, fy) of the canvas frame (0..1). */
export async function dragObjectTo(page: Page, obj: StudioObject, fx: number, fy: number) {
  const frame = await page.locator("canvas.upper-canvas").first().boundingBox()
  if (!frame) throw new Error("canvas not on screen")
  const from = { x: obj.viewport.x + obj.viewport.width / 2, y: obj.viewport.y + obj.viewport.height / 2 }
  const to = { x: frame.x + frame.width * fx, y: frame.y + frame.height * fy }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 25 })
  await page.mouse.up()
  return { frame, to }
}

/**
 * Draw a fixture image in the browser (no image libs in the storefront).
 * `noise` adds a block of random pixels so the PNG doesn't compress to
 * nothing — a real 600 dpi file is several MB.
 */
export async function makeImage(
  page: Page,
  opts: { width: number; height: number; type?: "image/png" | "image/jpeg"; noise?: number }
): Promise<Buffer> {
  const bytes: number[] = await page.evaluate(
    async ({ width, height, type, noise, rgb }) => {
      const c = document.createElement("canvas")
      c.width = width
      c.height = height
      const x = c.getContext("2d")!
      x.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`
      x.fillRect(width * 0.08, height * 0.08, width * 0.84, height * 0.84)
      if (noise) {
        const side = Math.round(Math.sqrt(noise))
        const img = x.createImageData(side, side)
        for (let i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 255) | 0
        x.putImageData(img, Math.round(width * 0.1), Math.round(height * 0.1))
      }
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type, 0.92))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    },
    { width: opts.width, height: opts.height, type: opts.type ?? "image/png", noise: opts.noise ?? 0, rgb: ART_RGB }
  )
  return Buffer.from(bytes)
}

/** Decode an image URL in the page (via the storefront's CORS proxy) and measure the artwork colour in it. */
export async function measureArtwork(page: Page, url: string) {
  return page.evaluate(
    async ({ url, rgb }) => {
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`)
      if (!res.ok) return { ok: false as const, status: res.status }
      const bmp = await createImageBitmap(await res.blob())
      const c = document.createElement("canvas")
      c.width = bmp.width
      c.height = bmp.height
      const x = c.getContext("2d")!
      x.drawImage(bmp, 0, 0)
      const d = x.getImageData(0, 0, c.width, c.height).data
      let hits = 0
      let opaque = 0
      let minY = Infinity
      let maxY = -1
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 20) opaque++
        if (Math.abs(d[i] - rgb.r) < 40 && Math.abs(d[i + 1] - rgb.g) < 40 && Math.abs(d[i + 2] - rgb.b) < 40) {
          hits++
          const y = Math.floor(i / 4 / c.width)
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
      return { ok: true as const, width: c.width, height: c.height, hits, opaque, minY, maxY }
    },
    { url, rgb: ART_RGB }
  )
}

/* ---- Cart (store API) — read what the Studio really saved, then clean up ---- */

export async function cartId(context: BrowserContext): Promise<string | null> {
  const cookie = (await context.cookies()).find((c) => c.name === "_medusa_cart_id")
  return cookie?.value || null
}

function storeHeaders() {
  if (!PUBLISHABLE_KEY) throw new Error("STUDIO_PUBLISHABLE_KEY is not set")
  return { "x-publishable-api-key": PUBLISHABLE_KEY, "content-type": "application/json" }
}

export async function fetchCart(id: string): Promise<any> {
  const res = await fetch(`${BACKEND_URL}/store/carts/${id}?fields=*items,items.metadata`, { headers: storeHeaders() })
  if (!res.ok) throw new Error(`cart ${id}: ${res.status}`)
  return (await res.json()).cart
}

/** Open "Quantity & checkout", set one size and press the main button (Add to cart / Update cart). */
export async function submitDesign(page: Page, opts: { size?: string; qty?: number; button?: RegExp } = {}) {
  const qty = page.getByLabel(`Quantity ${opts.size ?? "L"}`)
  if (!(await qty.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Quantity & checkout/ }).click()
  }
  await qty.fill(String(opts.qty ?? 1))
  await page.getByRole("button", { name: opts.button ?? /^Add to cart$/ }).click()
}

/**
 * Poll the cart until a Studio line exists whose renders cover `sides`
 * (the Studio writes the line, then its print + mockup files).
 */
export async function waitForDesignLine(
  context: BrowserContext,
  sides: string[],
  opts: { excludeIds?: string[]; timeout?: number } = {}
): Promise<any> {
  const want = [...sides].sort().join(",")
  let line: any = null
  await expect
    .poll(
      async () => {
        const id = await cartId(context)
        if (!id) return ""
        const cart = await fetchCart(id)
        line = (cart.items ?? []).find(
          (i: any) => i.metadata?.customizerDesign && !(opts.excludeIds ?? []).includes(i.id)
        )
        return (line?.metadata?.customizerDesign?.artifacts ?? [])
          .filter((a: any) => a.mockupUrl && a.printUrl)
          .map((a: any) => a.side)
          .sort()
          .join(",")
      },
      { timeout: opts.timeout ?? 120_000, intervals: [2_000] }
    )
    .toBe(want)
  return line
}

export const artifactFor = (line: any, side: string) =>
  (line.metadata.customizerDesign.artifacts ?? []).find((a: any) => a.side === side)

/** Remove every line so test carts never reach staff views or reminder emails. */
export async function emptyCart(context: BrowserContext) {
  const id = await cartId(context)
  if (!id || !PUBLISHABLE_KEY) return
  const cart = await fetchCart(id).catch(() => null)
  for (const item of cart?.items ?? []) {
    await fetch(`${BACKEND_URL}/store/carts/${id}/line-items/${item.id}`, {
      method: "DELETE",
      headers: storeHeaders(),
    }).catch(() => undefined)
  }
}
