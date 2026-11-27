import { expect, test, type Page } from "@playwright/test"

import { prepareContext } from "./helpers"

// The path an organisation's buyer walks: sign in → their organisation → Our
// range → cart → checkout up to Review. It NEVER places the order.
//
// Needs the robot login (GitHub secrets PORTAL_TEST_EMAIL / PORTAL_TEST_PASSWORD)
// and the permanent test organisation that login owns: on account, one saved
// address, one design in its range. That organisation is kept, not rebuilt per run.
const EMAIL = process.env.PORTAL_TEST_EMAIL ?? ""
const PASSWORD = process.env.PORTAL_TEST_PASSWORD ?? ""
const ORG = process.env.PORTAL_TEST_ORG ?? "SC Prints Portal Test"

/** Tabs a new organisation sees. The optional ones stay hidden until staff switch them on. */
const TABS = ["Overview", "Our range", "People", "Destinations", "Orders", "Drafts & approvals", "Invoices", "Account", "Members"]
const HIDDEN_TABS = ["Uniform allowance", "Brand kit"]

const removeButtons = (page: Page) => page.getByRole("button", { name: /^Remove .* from cart$/ })

async function emptyCart(page: Page) {
  await page.goto("/au/cart")
  // Each line has two remove buttons (desktop and phone layout); only one is visible.
  const visible = () => removeButtons(page).locator("visible=true")
  while (await visible().count()) {
    const before = await removeButtons(page).count()
    await visible().first().click()
    await expect.poll(() => removeButtons(page).count()).toBeLessThan(before)
  }
}

// Leave no cart behind, even when a step fails.
test.afterEach(async ({ page }) => {
  if (EMAIL && PASSWORD) await emptyCart(page).catch(() => undefined)
})

test("organisation buyer: sign in, open the organisation, order from the range, reach Review", async ({ page, context }) => {
  test.skip(!EMAIL || !PASSWORD, "needs PORTAL_TEST_EMAIL and PORTAL_TEST_PASSWORD")
  await prepareContext(context)
  const crashes: string[] = []
  page.on("pageerror", (e) => crashes.push(e.message))

  await test.step("sign in", async () => {
    await page.goto("/au/account")
    await page.getByTestId("email-input").fill(EMAIL)
    await page.getByTestId("password-input").fill(PASSWORD)
    await page.getByTestId("sign-in-button").click()
    await expect(page.getByTestId("login-error-message")).toHaveCount(0)
    await expect(page.getByTestId("two-step-page"), "the robot login must not use two-step login").toHaveCount(0)
    await expect(page.getByTestId("login-page")).toHaveCount(0)
  })

  await test.step("open the organisation: the right tabs, and each one opens", async () => {
    await page.goto("/au/account/organisations")
    await page.getByRole("link", { name: ORG }).first().click()
    await expect(page.getByRole("heading", { level: 1, name: ORG })).toBeVisible()
    const tabs = await page.locator('[role="tab"] > span:first-child').allTextContents()
    expect(tabs).toEqual(expect.arrayContaining(TABS))
    for (const hidden of HIDDEN_TABS) expect(tabs).not.toContain(hidden)
    for (const name of TABS) {
      await page.getByRole("tab", { name, exact: false }).first().click()
      const panel = page.locator('[role="tabpanel"]:not([hidden])')
      await expect(panel).toBeVisible()
      await expect(panel).not.toBeEmpty()
      await expect(page.getByText(/Something went wrong|Application error/i)).toHaveCount(0)
    }
  })

  await test.step("order from Our range", async () => {
    await emptyCart(page)
    await page.goto("/au/account/organisations")
    await page.getByRole("link", { name: ORG }).first().click()
    await page.getByRole("tab", { name: /Our range/ }).click()
    await page.locator('input[aria-label*=", size "]').first().fill("2")
    await page.getByRole("button", { name: "Add all to cart" }).click()
    // Let the add finish before leaving, as a person would. Clicking "View cart" the instant
    // it appears cuts off the form's last request, which logs a (harmless) page error.
    await expect(page.getByText(/Added \d+ garments? to your cart/)).toBeVisible()
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined)
    await page.getByRole("link", { name: "View cart" }).click()
    await expect(page).toHaveURL(/\/cart/)
    await expect(removeButtons(page).locator("visible=true").first()).toBeVisible()
  })

  await test.step("checkout: saved address → delivery → pay on account → Review", async () => {
    await page.goto("/au/checkout?step=address")
    // The organisation's saved address is offered, and choosing it fills the form.
    await expect(page.getByTestId("org-address-picker")).toBeVisible()
    // No waiting here on purpose: on 28 Nov, choosing the address and typing the phone
    // before the form had filled the buyer's email left the Email box empty at submit.
    const email = page.getByTestId("shipping-email-input")
    await page.getByTestId("org-address-picker").getByTestId("shipping-address-select").click()
    await page.getByTestId("shipping-address-option").first().click()
    await expect(page.getByTestId("shipping-company-input")).toHaveValue(ORG)
    const phone = page.locator('input[name="shipping_address.phone"]')
    if (!(await phone.inputValue())) await phone.fill("0400000000")
    await expect(email, "a signed-in buyer's email is filled in, however fast they type").not.toHaveValue("", { timeout: 20_000 })
    await page.getByTestId("submit-address-button").click()

    // The only delivery option is picked for the customer, with a price.
    await expect(page.getByTestId("delivery-option-radio").first()).toBeVisible()
    await page.getByTestId("submit-delivery-option-button").click()

    await page.getByTestId("org-order-select").selectOption({ label: ORG })
    await page.getByText(/Pay on account · invoice due in \d+ days/).click()
    await page.getByTestId("submit-payment-button").click()

    // Stop here. Refuse every form post from now on, so nothing can place the order.
    await expect(page.getByTestId("submit-order-button")).toBeVisible()
    await page.route("**/*", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()))
    await expect(page.getByTestId("submit-order-button")).toBeEnabled()
    await expect(page.getByTestId("submit-order-button")).toHaveText(/Place order on account/)
    await page.unroute("**/*")
  })

  await test.step("past orders open, with their invoice", async () => {
    await page.goto("/au/account/organisations")
    await page.getByRole("link", { name: ORG }).first().click()
    await page.getByRole("tab", { name: /^Orders/ }).click()
    const firstOrder = page.locator('[role="tabpanel"]:not([hidden]) a[href*="/orders/"]').first()
    // Only once the organisation has an order (the dress-rehearsal order stays as the fixture).
    if (await firstOrder.count()) {
      await firstOrder.click()
      await expect(page).toHaveURL(/\/orders\//)
      await expect(page.getByText(/Something went wrong|Application error|Page not found/i)).toHaveCount(0)
      const invoice = page.getByRole("link", { name: /invoice/i }).first()
      if (await invoice.count()) {
        const res = await page.request.get((await invoice.getAttribute("href")) as string)
        expect(res.status()).toBe(200)
      }
    }
  })

  expect(crashes, `page errors:\n${crashes.join("\n")}`).toEqual([])
})
