import { devices, expect, test } from "@playwright/test"

import {
  artifactFor,
  dragObjectTo,
  emptyCart,
  makeImage,
  measureArtwork,
  openStudio,
  prepareContext,
  PUBLISHABLE_KEY,
  studioCanvas,
  studioObjects,
  submitDesign,
  touchDrag,
  uploadArtwork,
  waitForDesignLine,
} from "./helpers"

// Most traffic is phones. Same journey, phone screen + touch device profile.
test.use({ ...devices["Pixel 7"] })

test.beforeEach(async ({ context }) => {
  await prepareContext(context)
})

test.afterEach(async ({ context }) => {
  await emptyCart(context)
})

test("phone: upload, drag and add to cart", async ({ page, context }) => {
  test.skip(!PUBLISHABLE_KEY, "needs STUDIO_PUBLISHABLE_KEY to read the cart back")
  await openStudio(page)
  await uploadArtwork(page, { name: "logo.png", mimeType: "image/png", buffer: await makeImage(page, { width: 3000, height: 2250 }) })

  await page.locator("canvas.upper-canvas").first().scrollIntoViewIfNeeded()
  const [placed] = await studioObjects(page)
  await dragObjectTo(page, placed, 0.5, 0.7)
  const [moved] = await studioObjects(page)
  const { visible } = await studioCanvas(page)
  // A drag must move the art, not resize it via a corner handle.
  expect(Math.abs(moved.scene.width - placed.scene.width)).toBeLessThan(0.5)
  expect(moved.scene.top).toBeGreaterThan(placed.scene.top + visible.height * 0.2)

  await submitDesign(page)
  const line = await waitForDesignLine(context, ["front"])
  const mockup = await measureArtwork(page, artifactFor(line, "front").mockupUrl)
  expect(mockup.ok && mockup.hits).toBeGreaterThan(0)
})

// Small, common and large phones, as the browser leaves them (URL bar showing).
for (const [width, height] of [
  [360, 640],
  [390, 664],
  [430, 932],
] as const) {
  test.describe(`phone ${width}x${height}`, () => {
    test.use({ viewport: { width, height } })

    test("a finger moves small artwork, and its corner still resizes it", async ({ page }) => {
      await openStudio(page)
      await uploadArtwork(page, { name: "logo.png", mimeType: "image/png", buffer: await makeImage(page, { width: 3000, height: 2250 }) })
      await page.locator("canvas.upper-canvas").first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: test.info().outputPath("studio.png") })

      const frame = (await page.locator("canvas.upper-canvas").first().boundingBox())!
      expect(frame.height, "garment is big enough to work on").toBeGreaterThan(height * 0.23)

      const [placed] = await studioObjects(page)
      const centre = (o: typeof placed) => ({ x: o.viewport.x + o.viewport.width / 2, y: o.viewport.y + o.viewport.height / 2 })
      const from = centre(placed)
      // A finger rarely lands dead centre.
      const press = { x: from.x + 8, y: from.y + 6 }
      await touchDrag(page, press, { x: press.x, y: press.y + frame.height * 0.3 })
      await expect.poll(async () => centre((await studioObjects(page))[0]).y).toBeGreaterThan(from.y + frame.height * 0.2)
      const [moved] = await studioObjects(page)
      expect(Math.abs(moved.scene.width - placed.scene.width)).toBeLessThan(0.5)

      // The corner handle sits on a box at least 44px across (lib/grab-area.ts).
      const at = centre(moved)
      const pad = Math.max(4, Math.ceil((44 - Math.min(moved.viewport.width, moved.viewport.height)) / 2))
      const corner = { x: at.x + moved.viewport.width / 2 + pad + 2, y: at.y + moved.viewport.height / 2 + pad + 2 }
      await touchDrag(page, corner, { x: corner.x + 25, y: corner.y + 25 })
      await expect.poll(async () => (await studioObjects(page))[0].scene.width).toBeGreaterThan(moved.scene.width + 2)
    })
  })
}
