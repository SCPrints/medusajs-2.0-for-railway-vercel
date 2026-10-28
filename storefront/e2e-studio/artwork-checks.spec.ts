import { expect, test } from "@playwright/test"

import {
  artifactFor,
  emptyCart,
  makeImage,
  measureArtwork,
  openArtworkStep,
  openStudio,
  prepareContext,
  PUBLISHABLE_KEY,
  studioObjects,
  submitDesign,
  uploadArtwork,
  waitForDesignLine,
} from "./helpers"

test.beforeEach(async ({ context }) => {
  await prepareContext(context)
})

test.afterEach(async ({ context }) => {
  await emptyCart(context)
})

// Current behaviour (2026-10-29): the pop-up opens once when artwork drops
// below 150 DPI and stays closed after "Close" — Add to cart does not ask again.
test("low-res artwork opens the DPI pop-up with both fixes", async ({ page }) => {
  await openStudio(page)
  await uploadArtwork(page, { name: "tiny.png", mimeType: "image/png", buffer: await makeImage(page, { width: 300, height: 225 }) })

  const dialog = page.getByTestId("low-resolution-modal")
  await expect(dialog).toContainText(/\d+ DPI/)
  await expect(dialog.getByRole("button", { name: /Upload a higher quality file/ })).toBeVisible()
  await expect(dialog.getByRole("button", { name: /Add vectorization/ })).toBeVisible()
  await dialog.getByRole("button", { name: "Close" }).click()
  await expect(dialog).toBeHidden()
})

test("text tool adds text that prints", async ({ page, context }) => {
  await openStudio(page)
  await openArtworkStep(page)
  await page.getByPlaceholder("Your text").fill("TEAM SC")
  await page.getByRole("button", { name: "Use #e11d48" }).click()
  await page.getByRole("button", { name: "Add text to design" }).click()
  await expect.poll(async () => (await studioObjects(page)).length).toBe(1)

  test.skip(!PUBLISHABLE_KEY, "needs STUDIO_PUBLISHABLE_KEY to read the cart back")
  await submitDesign(page)
  const line = await waitForDesignLine(context, ["front"])
  const print = await measureArtwork(page, artifactFor(line, "front").printUrl)
  expect(print.ok && print.hits, "text is in the print file").toBeGreaterThan(0)
})
