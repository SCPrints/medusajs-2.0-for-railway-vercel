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
})
