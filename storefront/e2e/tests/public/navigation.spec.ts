import { test, expect } from "../../index"

test.describe("Public navigation smoke tests", async () => {
  test("contact page FAQ link opens FAQ page", async ({ page }) => {
    await page.getByTestId("nav-menu-button").click()
    await page
      .getByTestId("nav-menu-popup")
      .getByRole("link", { name: "Contact Us" })
      .click()

    await expect(page).toHaveURL(/\/contact$/)

    await page
      .getByRole("link", { name: /Check our Frequently Asked Questions/i })
      .click()

    await expect(page).toHaveURL(/\/faq$/)
    await expect(
      page.getByRole("heading", { name: /Frequently Asked Questions/i })
    ).toBeVisible()
  })

  test("services page can navigate to service detail", async ({ page }) => {
    await page.getByTestId("nav-menu-button").click()
    await page
      .getByTestId("nav-menu-popup")
      .getByRole("link", { name: "Services" })
      .click()

    await expect(page).toHaveURL(/\/services$/)
    await page.getByRole("link", { name: "View service details" }).first().click()

    await expect(page).toHaveURL(/\/services\/[a-z-]+$/)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  })

  test("menu site map link opens sitemap page", async ({ page }) => {
    await page.getByTestId("nav-menu-button").click()
    await page
      .getByTestId("nav-menu-popup")
      .getByTestId("nav-menu-sitemap-link")
      .click()

    await expect(page).toHaveURL(/\/sitemap$/)
    await expect(
      page.getByRole("heading", { name: /site map/i })
    ).toBeVisible()
  })

  test("first collection link opens collection when store has collections", async ({
    page,
  }, testInfo) => {
    await page.getByTestId("nav-menu-button").click()
    const popup = page.getByTestId("nav-menu-popup")
    const collectionLinks = popup.locator(
      '[data-testid^="nav-menu-collection-"]'
    )
    if ((await collectionLinks.count()) === 0) {
      testInfo.skip(true, "No collections in store")
    }
    await collectionLinks.first().click()
    await expect(page).toHaveURL(/\/collections\/[^/]+$/)
  })
})
