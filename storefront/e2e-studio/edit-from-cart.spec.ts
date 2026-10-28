import { expect, test } from "@playwright/test"

import {
  artifactFor,
  cartId,
  dragObjectTo,
  fetchCart,
  emptyCart,
  makeImage,
  measureArtwork,
  openStudio,
  prepareContext,
  PUBLISHABLE_KEY,
  studioCanvas,
  studioObjects,
  submitDesign,
  TEST_HANDLE,
  uploadArtwork,
  waitForDesignLine,
} from "./helpers"

test.beforeEach(async ({ context }) => {
  test.skip(!PUBLISHABLE_KEY, "needs STUDIO_PUBLISHABLE_KEY to read the cart back")
  await prepareContext(context)
})

test.afterEach(async ({ context }) => {
  await emptyCart(context)
})

// Same reload path as "Re-order" and saved designs: a cart line's design must
// come back exactly where it was left, and an edit must replace, not duplicate.
test("edit from cart reopens the design in place and updates the line", async ({ page, context }) => {
  await openStudio(page)
  await uploadArtwork(page, { name: "logo.png", mimeType: "image/png", buffer: await makeImage(page, { width: 3000, height: 2250 }) })
  const [placed] = await studioObjects(page)
  await dragObjectTo(page, placed, 0.5, 0.78)
  const [before] = await studioObjects(page)
  const { visible } = await studioCanvas(page)

  await submitDesign(page)
  const original = await waitForDesignLine(context, ["front"])

  // Reopen through the cart's "Edit design" link.
  await page.goto(`/au/products/${TEST_HANDLE}?edit=${original.id}`)
  await expect.poll(async () => (await page.evaluate(() => (window as any).__scpStudio?.objects().length ?? 0)), {
    timeout: 60_000,
  }).toBe(1)
  const [reopened] = await studioObjects(page)
  const tol = visible.height * 0.02
  expect(Math.abs(reopened.scene.top - before.scene.top)).toBeLessThan(tol)
  expect(Math.abs(reopened.scene.left - before.scene.left)).toBeLessThan(tol)
  expect(Math.abs(reopened.scene.width - before.scene.width)).toBeLessThan(tol)

  // Move it back up, save: one line, new placement on the mockup.
  await dragObjectTo(page, reopened, 0.5, 0.4)
  await submitDesign(page, { button: /^Update cart$/ })
  const updated = await waitForDesignLine(context, ["front"], { excludeIds: [original.id] })
  // Replaced, not duplicated: the old line is gone.
  await expect
    .poll(async () => {
      const cart = await fetchCart((await cartId(context))!)
      return (cart.items ?? []).filter((i: any) => i.metadata?.customizerDesign).map((i: any) => i.id)
    })
    .toEqual([updated.id])

  const mockup = await measureArtwork(page, artifactFor(updated, "front").mockupUrl)
  expect(mockup.ok).toBe(true)
  if (mockup.ok) {
    const middle = (mockup.minY + mockup.maxY) / 2 / mockup.height
    expect(Math.abs(middle - 0.4)).toBeLessThan(0.06)
  }
})
