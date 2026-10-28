import { expect, test } from "@playwright/test"

import {
  dragObjectTo,
  emptyCart,
  fetchCart,
  cartId,
  makeImage,
  measureArtwork,
  openStudio,
  prepareContext,
  PUBLISHABLE_KEY,
  studioCanvas,
  studioObjects,
  studioSide,
  uploadArtwork,
} from "./helpers"

const ARCHIVE_FAILED = /couldn.t save .* to our servers/i
const NUDGED = /nudged to stay on the garment/i

test.beforeEach(async ({ context }) => {
  await prepareContext(context)
})

test.afterEach(async ({ context }) => {
  await emptyCart(context)
})

test("upload lands on the front and the original is saved", async ({ page }) => {
  await openStudio(page)
  const saved = page.waitForResponse((r) => r.url().includes("/upload-original") && r.request().method() === "POST")
  await uploadArtwork(page, { name: "logo.png", mimeType: "image/png", buffer: await makeImage(page, { width: 3000, height: 2250 }) })

  expect((await saved).status()).toBe(200)
  const [obj] = await studioObjects(page)
  expect(obj.uploadId).toBeTruthy()
  expect(await studioSide(page)).toBe("front")
  await expect(page.getByText(ARCHIVE_FAILED)).toHaveCount(0)
})

test("artwork can be dragged down to the hem", async ({ page }) => {
  await openStudio(page)
  await uploadArtwork(page, { name: "logo.png", mimeType: "image/png", buffer: await makeImage(page, { width: 1600, height: 1200 }) })
  const [obj] = await studioObjects(page)

  await dragObjectTo(page, obj, 0.5, 0.86)

  const [moved] = await studioObjects(page)
  const { visible } = await studioCanvas(page)
  const centreY = moved.scene.top + moved.scene.height / 2
  // Landed where it was dropped (the old clamp pinned it ~2/3 down the shirt).
  expect(Math.abs(centreY - (visible.y + visible.height * 0.86))).toBeLessThan(visible.height * 0.04)
  await expect(page.getByText(NUDGED)).toHaveCount(0)
})

// Big files go browser → backend directly (Vercel's relay 413s anything over
// ~3 MB). Previews work because STORE_CORS allows this project's
// *.vercel.app deploy URLs (pattern added 2026-10-29).
test("a 600 dpi A3 file uploads and saves", async ({ page }) => {
  await openStudio(page)
  // 38×48 cm at 600 dpi, with ~4 MB of noise so it is as heavy as a real file.
  const big = await makeImage(page, { width: 8976, height: 11339, noise: 1_100_000 })
  expect(big.length).toBeGreaterThan(3_500_000)
  const saved = page.waitForResponse((r) => r.url().includes("/upload-original") && r.request().method() === "POST", {
    timeout: 120_000,
  })

  await uploadArtwork(page, { name: "BACK_38x48cm_600dpi.png", mimeType: "image/png", buffer: big })

  expect((await saved).status()).toBe(200)
  await expect(page.getByText(ARCHIVE_FAILED)).toHaveCount(0)
})

test("an SVG with live text warns about fonts", async ({ page }) => {
  await openStudio(page)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#e11d48"/><text x="40" y="180" font-size="90" font-family="Bebas Neue">TEAM</text></svg>`
  await uploadArtwork(page, { name: "team.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) })

  await expect(page.getByText(/convert text to outlines/i).first()).toBeVisible()
})

test("front + back design reaches the cart with renders where the art was put", async ({ page, context }) => {
  test.skip(!PUBLISHABLE_KEY, "needs STUDIO_PUBLISHABLE_KEY to read the cart back")
  await openStudio(page)

  // Front: logo, dragged low on the shirt.
  await uploadArtwork(page, { name: "front.png", mimeType: "image/png", buffer: await makeImage(page, { width: 3000, height: 2250 }) })
  const [front] = await studioObjects(page)
  await dragObjectTo(page, front, 0.5, 0.8)

  // Back: second location, second file.
  await page.getByRole("button", { name: /Add print to another location/ }).click()
  await page.getByRole("tab", { name: "Back", exact: true }).click()
  await expect.poll(() => studioSide(page)).toBe("back")
  await uploadArtwork(page, { name: "back.png", mimeType: "image/png", buffer: await makeImage(page, { width: 3000, height: 3800 }) })

  await page.getByRole("button", { name: /Quantity & checkout/ }).click()
  await page.getByLabel("Quantity L").fill("1")

  const renders: Array<{ url: string; status: number }> = []
  page.on("response", (r) => {
    if (/\/api\/customizer\/render-(print|mockup)/.test(r.url())) renders.push({ url: r.url(), status: r.status() })
  })
  const started = Date.now()
  await page.getByRole("button", { name: /^Add to cart$/ }).click()

  // The cart line is the source of truth: poll it until the Studio has written it.
  let line: any = null
  await expect
    .poll(
      async () => {
        const id = await cartId(context)
        if (!id) return 0
        const cart = await fetchCart(id)
        line = (cart.items ?? []).find((i: any) => i.metadata?.customizerDesign)
        const sides = (line?.metadata?.customizerDesign?.artifacts ?? [])
          .filter((a: any) => a.mockupUrl && a.printUrl)
          .map((a: any) => a.side)
          .sort()
        return sides.join(",")
      },
      { timeout: 120_000, intervals: [2_000] }
    )
    .toBe("back,front")
  const seconds = (Date.now() - started) / 1000

  expect(renders.filter((r) => r.status !== 200)).toEqual([])
  expect(seconds).toBeLessThan(60)

  const design = line.metadata.customizerDesign
  const bySide = Object.fromEntries((design.artifacts ?? []).map((a: any) => [a.side, a]))
  expect(Object.keys(bySide).sort()).toEqual(["back", "front"])
  expect(design.customerOriginalFiles?.length ?? 0).toBeGreaterThanOrEqual(2)

  for (const side of ["front", "back"]) {
    const print = await measureArtwork(page, bySide[side].printUrl)
    expect(print.ok && print.hits, `${side} print file has the artwork`).toBeGreaterThan(0)
    const mockup = await measureArtwork(page, bySide[side].mockupUrl)
    expect(mockup.ok && mockup.hits, `${side} mockup shows the artwork`).toBeGreaterThan(0)
  }
  // The front art was dragged low — the mockup must show it low too.
  const frontMockup = await measureArtwork(page, bySide.front.mockupUrl)
  if (frontMockup.ok) {
    const middle = (frontMockup.minY + frontMockup.maxY) / 2 / frontMockup.height
    expect(Math.abs(middle - 0.8)).toBeLessThan(0.06)
  }
})
