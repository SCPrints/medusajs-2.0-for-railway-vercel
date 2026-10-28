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
