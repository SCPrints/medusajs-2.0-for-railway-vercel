import { expect, test } from "@playwright/test"

import {
  ADMIN_KEY,
  adminApi,
  dragObjectTo,
  makeImage,
  measureArtwork,
  openStudioUrl,
  prepareContext,
  studioObjects,
  submitDesign,
  TEST_EMAIL,
  TEST_HANDLE,
  uploadArtwork,
} from "./helpers"

// Staff-side Studio flows. They start from the admin (signed quote links,
// POS sessions, order lines), so they need the admin key; each creates its
// own throwaway data and removes it. Nothing here emails anyone.
test.beforeEach(async ({ context }) => {
  test.skip(!ADMIN_KEY, "needs STUDIO_ADMIN_API_KEY")
  await prepareContext(context)
})

test("quote mode: design lands on the quote in dollars, and re-editing replaces it", async ({ page }) => {
  const { quote } = await adminApi("/admin/quotes", {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, contact_name: "Studio test", subject: "STUDIO TEST — auto-deleted" }),
  })
  const group = `gs_studiotest_${Date.now().toString(36)}`
  const linesFor = async () =>
    ((await adminApi(`/admin/quotes/${quote.id}`)).quote.line_items?.items ?? []).filter((l: any) => l.group_id === group)
  try {
    const { url } = await adminApi(`/admin/quotes/${quote.id}/design-link?group=${group}&handle=${TEST_HANDLE}`)
    await openStudioUrl(page, url)
    await uploadArtwork(page, { name: "logo.png", mimeType: "image/png", buffer: await makeImage(page, { width: 3000, height: 2250 }) })
    await submitDesign(page, { qty: 2, button: /^Add design to quote$/ })

    await expect.poll(async () => (await linesFor()).map((l: any) => l.quantity), { timeout: 120_000, intervals: [2_000] }).toEqual([2])
    const [line] = await linesFor()
    // Dollars, not cents: the Studio's price field is named "...Cents" but holds dollars.
    expect(Number(line.unit_price)).toBeGreaterThan(5)
    expect(Number(line.unit_price)).toBeLessThan(1000)
    // The admin API slims the design to mockup / print URL lists (what staff see).
    expect(line.customizerDesign).toBeTruthy()
    const mockup = (line.mockup_urls ?? []).find((m: any) => m.side === "front")?.url
    expect(mockup, "front mockup on the quote line").toBeTruthy()
    expect((line.print_urls ?? []).some((p: any) => p.side === "front")).toBe(true)
    expect((await measureArtwork(page, mockup)) as any).toMatchObject({ ok: true })

    // Staff "Edit design in Studio" again: the saved design reloads, and saving
    // replaces the group's lines rather than adding to them.
    await openStudioUrl(page, url)
    await expect.poll(async () => (await studioObjects(page)).length, { timeout: 30_000 }).toBe(1)
    await submitDesign(page, { qty: 3, button: /^Add design to quote$/ })
    await expect(page.getByText(/Saved to quote/).first()).toBeVisible({ timeout: 120_000 })
    const summary = async () =>
      (await linesFor()).map((l: any) => `${l.variant_id}:${l.quantity}`).join(",")
    await expect.poll(summary, { timeout: 60_000, intervals: [2_000] }).toMatch(/^[^,]+:3$/)
  } finally {
    await adminApi(`/admin/quotes/${quote.id}`, { method: "DELETE" }).catch(() => undefined)
  }
})

test("POS: a Studio design reaches the sale with its mockup", async ({ page }) => {
  const { pos_session } = await adminApi("/admin/pos/sessions", { method: "POST", body: JSON.stringify({ metadata: { studio_test: true } }) })
  try {
    await openStudioUrl(page, `https://x/au/customizer?handle=${TEST_HANDLE}&pos_session=${pos_session.id}`)
    await uploadArtwork(page, { name: "logo.png", mimeType: "image/png", buffer: await makeImage(page, { width: 3000, height: 2250 }) })
    await submitDesign(page, { qty: 1, button: /^Add to sale$/ })

    let item: any = null
    await expect
      .poll(async () => {
        const { pos_session: s } = await adminApi(`/admin/pos/sessions/${pos_session.id}`)
        item = (s.items ?? []).find((i: any) => i.kind === "customizer")
        return Boolean(item)
      }, { timeout: 120_000, intervals: [2_000] })
      .toBe(true)
    const front = (item.metadata?.customizerDesign?.artifacts ?? []).find((a: any) => a.side === "front")
    expect(item.quantity).toBe(1)
    expect((await measureArtwork(page, front?.mockupUrl)) as any).toMatchObject({ ok: true })
  } finally {
    await adminApi(`/admin/pos/sessions/${pos_session.id}`, { method: "DELETE" }).catch(() => undefined)
  }
})

test("staff proof: a real order line reopens, moves, and saves a new mockup", async ({ page }) => {
  // Read-only on the order: the proof is handed to the admin window, which the
  // test stands in for — nothing is written back to the order.
  const { orders } = await adminApi(
    "/admin/orders?limit=25&order=-created_at&fields=id,items.id,items.variant_id,items.product_handle,items.metadata"
  )
  const candidates = (orders ?? []).flatMap((o: any) =>
    (o.items ?? []).map((i: any) => ({ order: o.id, line: i }))
  )
  const pick = candidates.find(({ line }: any) => {
    const d = line.metadata?.customizerDesign
    const front = Array.isArray(d?.sideLayouts) ? d.sideLayouts.find((s: any) => s.side === "front") : null
    return line.variant_id && line.product_handle && !d?.sideLayouts_archived_url &&
      (front?.objects ?? []).some((o: any) => o.type === "Image")
  })
  test.skip(!pick, "no recent order line with a front image design")
  const saved = pick.line.metadata.customizerDesign.sideLayouts.find((s: any) => s.side === "front").objects.length

  await openStudioUrl(
    page,
    `https://x/au/customizer?handle=${pick.line.product_handle}&variant=${pick.line.variant_id}&adminProof=${pick.order}:${pick.line.id}:front`
  )
  await expect.poll(async () => (await studioObjects(page)).length, { timeout: 60_000 }).toBe(saved)
  await page.evaluate(() => {
    window.addEventListener("message", (e) => {
      if (e.data?.type === "ADMIN_PROOF_SAVED") (window as any).__proofSaved = e.data
    })
  })

  const [first] = await studioObjects(page)
  await dragObjectTo(page, first, 0.5, 0.45)
  await page.getByRole("button", { name: "Save Proof" }).click()
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__proofSaved)), { timeout: 120_000 }).toBe(true)
  const message = await page.evaluate(() => (window as any).__proofSaved)
  expect(message).toMatchObject({ orderId: pick.order, lineItemId: pick.line.id, side: "front" })
  expect((await measureArtwork(page, message.mockupUrl)) as any).toMatchObject({ ok: true })
})

// Embroidery over the auto-priced stitch cap is "price on application": the
// Studio sends the design to staff as a quote instead of the cart. Submitted
// as TEST_EMAIL, which the backend never emails staff about (isStudioTestEmail).
test("price on application: over-cap embroidery becomes a quote with the design", async ({ page }) => {
  test.skip(!process.env.STUDIO_POA_ENABLED, "waits for the backend test-email rule to be deployed")
  await openStudioUrl(page, `https://x/au/customizer-v2?handle=${TEST_HANDLE}`)
  await uploadArtwork(page, { name: "crest.png", mimeType: "image/png", buffer: await makeImage(page, { width: 2000, height: 2000 }) })

  await page.getByRole("button", { name: /Print location & size/ }).click()
  await page.getByRole("button", { name: /Embroidery/ }).first().click()
  await page.getByLabel("Stitch count").first().fill("20000")
  await submitDesign(page, { qty: 12, button: /^Request a quote$/ })

  const dialog = page.getByRole("dialog", { name: "Request an embroidery quote" })
  await dialog.getByPlaceholder("you@example.com").fill(TEST_EMAIL)
  await dialog.getByPlaceholder("0412 345 678").fill("0400 000 000")
  await dialog.getByRole("button", { name: "Send quote request" }).click()

  let quote: any = null
  await expect
    .poll(async () => {
      const { quotes } = await adminApi(`/admin/quotes?q=${encodeURIComponent(TEST_EMAIL)}&limit=20`)
      quote = (quotes ?? []).find((q: any) => q.source === "customizer_poa" && Date.now() - Date.parse(q.created_at) < 10 * 60_000)
      return Boolean(quote)
    }, { timeout: 120_000, intervals: [3_000] })
    .toBe(true)
  try {
    const { quote: full } = await adminApi(`/admin/quotes/${quote.id}`)
    expect(full.metadata?.poa_request).toBe(true)
    const lines = full.line_items?.items ?? []
    expect(lines.reduce((n: number, l: any) => n + (l.quantity ?? 0), 0)).toBe(12)
    expect(lines.every((l: any) => l.customizerDesign && (l.mockup_urls ?? []).length > 0)).toBe(true)
  } finally {
    await adminApi(`/admin/quotes/${quote.id}`, { method: "DELETE" }).catch(() => undefined)
  }
})
