import { expect, test, type Page } from "@playwright/test"

import {
  artifactFor,
  emptyCart,
  makeImage,
  measureArtwork,
  openStudio,
  prepareContext,
  PUBLISHABLE_KEY,
  studioSide,
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

/** Front logo, then a second print on the left sleeve; leaves the price breakdown open. */
async function addSleevePrint(page: Page, handle: string) {
  await openStudio(page, handle)
  await uploadArtwork(page, { name: "front.png", mimeType: "image/png", buffer: await makeImage(page, { width: 2000, height: 1500 }) })
  await page.getByRole("button", { name: /Add print to another location/ }).click()
  await page.getByRole("tab", { name: "Left Sleeve", exact: true }).click()
  await expect.poll(() => studioSide(page)).toBe("left_sleeve")
  await uploadArtwork(page, { name: "sleeve.png", mimeType: "image/png", buffer: await makeImage(page, { width: 2000, height: 2000 }) })
  await page.getByRole("button", { name: /Quantity & checkout/ }).click()
  const breakdown = page.getByRole("button", { name: /Price breakdown/ })
  if (await breakdown.isVisible().catch(() => false)) await breakdown.click()
}

test("short-sleeve tee: sleeve print is fixed at A6", async ({ page }) => {
  await addSleevePrint(page, "as-colour-classic-tee-5026")
  await expect(page.getByText(/Print \d · left sleeve/i)).toBeVisible()
  // One allowed size → no picker at all.
  await expect(page.getByLabel("Print size, left sleeve")).toHaveCount(0)
})

test("long-sleeve tee: sleeve print goes up to A3, never oversize, and renders", async ({ page, context }) => {
  await addSleevePrint(page, "as-colour-staple-long-sleeve-tee-5020")
  const options = await page.getByLabel("Print size, left sleeve").locator("option").allTextContents()
  expect(options).toContain("Up to A3")
  expect(options.join(" ")).not.toMatch(/Oversize/i)

  test.skip(!PUBLISHABLE_KEY, "needs STUDIO_PUBLISHABLE_KEY to read the cart back")
  await submitDesign(page)
  const line = await waitForDesignLine(context, ["front", "left_sleeve"])
  const sleeve = await measureArtwork(page, artifactFor(line, "left_sleeve").mockupUrl)
  expect(sleeve.ok && sleeve.hits, "sleeve mockup shows the artwork").toBeGreaterThan(0)
})
