import fs from "fs"
import path from "path"
import PDFDocument from "pdfkit"
import sharp from "sharp"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type {
  MedusaContainer,
  IOrderModuleService,
} from "@medusajs/framework/types"

import {
  SCP_BANK_ACCOUNT_NAME,
  SCP_BANK_ACCOUNT_NUMBER,
  SCP_BANK_BSB,
  SCP_COMPANY_ABN,
} from "../../lib/constants"

const ASSETS_DIR = path.join(__dirname, "../../assets")
const FONTS_DIR = path.join(ASSETS_DIR, "fonts")
const IMAGES_DIR = path.join(ASSETS_DIR, "images")

const BRAND_PRIMARY = "#0f172a"
const BRAND_SECONDARY = "#ff2e63"
const TEXT_MUTED = "#666666"
const RULE_COLOR = "#e5e7eb"

type Address = {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
}

type ShippingMethod = {
  name?: string | null
  amount?: number | string | null
}

type LineItemPricing = {
  baseUnitPriceCents?: number | null
  sideSurchargePerUnitCents?: number | null
}

type CustomizerDesign = {
  pricing?: LineItemPricing | null
}

type OrderItem = {
  id: string
  title?: string | null
  product_title?: string | null
  variant_title?: string | null
  variant_sku?: string | null
  quantity?: number | null
  unit_price?: number | string | null
  total?: number | string | null
  metadata?: Record<string, unknown> | null
}

export type ReceiptOrder = {
  id: string
  display_id?: number | string | null
  created_at?: Date | string | null
  email?: string | null
  customer_id?: string | null
  currency_code?: string | null
  /** Items only, ex-GST. Preferred for the "Subtotal (ex GST)" line —
   *  `subtotal` includes shipping on this deployment, so don't use it. */
  item_subtotal?: number | string | null
  /** Shipping ex-GST. `shipping_total` is tax-inclusive once GST applies. */
  shipping_subtotal?: number | string | null
  subtotal?: number | string | null
  shipping_total?: number | string | null
  tax_total?: number | string | null
  total?: number | string | null
  /** True when `tax_total` is GST embedded in the total (1/11) rather than
   *  added on top — i.e. the order was placed before GST was itemised. */
  gst_included?: boolean
  /** Σ payment rows against the order. null = unknown (payments query failed)
   *  — the PDF then omits the payment block rather than guessing. */
  paid_total?: number | null
  /** total − paid_total, floored at 0. null when paid_total is null. */
  balance_due?: number | null
  /** ISO due date from `metadata.balance_due_at` (deposit widget sets it). */
  due_at?: string | null
  metadata?: Record<string, unknown> | null
  shipping_address?: Address | null
  billing_address?: Address | null
  items?: OrderItem[] | null
  shipping_methods?: ShippingMethod[] | null
}

/**
 * Computes the invoice totals from an order's line items, shipping methods and
 * summary — the fields `retrieveOrder` reliably returns. Split out as a pure
 * function so it can be unit-tested without the DB.
 *
 * Why not read `order.item_subtotal` / `order.tax_total` directly?
 *  - `retrieveOrder` leaves the order-level aggregate totals at 0.
 *  - `query.graph` returns them undecorated (line-item quantity/unit_price come
 *    back as 0 too — it renders a $0 invoice).
 * The line items, `shipping_methods[].amount`, and `summary.raw_current_order_total`
 * ARE decorated correctly, so we derive the breakdown from them. GST is
 * tax-EXCLUSIVE here (added on top), so `unit_price` and shipping amounts are
 * ex-GST and lines reconcile: item_subtotal + shipping_subtotal + tax_total = total.
 */
export function computeReceiptTotals(
  raw: any,
  paidTotal?: number | null
): ReceiptOrder {
  const items = ((raw?.items ?? []) as OrderItem[]).map((it) => {
    const qty = toNumber(it.quantity)
    const unit = toNumber(it.unit_price)
    // Ex-GST line total (unit_price is ex-GST) so every line above the GST row
    // reconciles against the separate GST line.
    return { ...it, quantity: qty, unit_price: unit, total: unit * qty }
  })

  const itemSubtotal = items.reduce((sum, it) => sum + toNumber(it.total), 0)
  const shippingSubtotal = ((raw?.shipping_methods ?? []) as ShippingMethod[]).reduce(
    (sum, m) => sum + toNumber(m.amount),
    0
  )
  // A tax invoice documents the sale as it STANDS — order edits (added
  // charges, swapped items) legitimately change what's owed, so CURRENT
  // total comes first. Probed on prod order #44 (two confirmed edits):
  // current=238.28 (right), original=168.28 (stale mid-edit value) — the old
  // original-first chain printed an invoice missing a $70 added line.
  // On a FULLY-refunded order both current AND original collapse to 0 —
  // probed on prod order #43: original=0, current=0, paid_total=168.30 —
  // so the refund case falls through to paid_total (gross captured,
  // survives a refund) exactly as before, then top-level total, then the
  // ex-GST line sum.
  // ponytail: no partial-refund order exists in prod yet — if one appears and
  // current collapses only partially, re-probe before trusting paid_total here.
  const summary = (raw?.summary ?? {}) as Record<string, any>
  const summaryTotal =
    toNumber(summary.raw_current_order_total?.value) ||
    toNumber(summary.current_order_total) ||
    toNumber(summary.raw_original_order_total?.value) ||
    toNumber(summary.original_order_total) ||
    toNumber(summary.raw_paid_total?.value) ||
    toNumber(summary.paid_total) ||
    toNumber(raw?.total)
  const grandTotal = summaryTotal || itemSubtotal + shippingSubtotal

  const taxExempt = (raw?.metadata as Record<string, unknown> | undefined)?.tax_exempt === true
  // GST added on top (post-2026-06-24 orders — the config is tax-EXCLUSIVE).
  const addedGst = round2(grandTotal - itemSubtotal - shippingSubtotal)

  let taxTotal: number
  let gstIncluded: boolean
  if (taxExempt) {
    taxTotal = 0
    gstIncluded = false
  } else if (addedGst > 0.005) {
    // GST was itemised on top of the ex-GST lines.
    taxTotal = addedGst
    gstIncluded = false
  } else {
    // No GST line (order placed before GST was configured). A GST-registered
    // AU business's consideration is GST-inclusive by law, so the total already
    // contains 1/11 GST — surface it as embedded rather than showing $0.
    taxTotal = round2(grandTotal / 11)
    gstIncluded = true
  }

  // Payment state. paid_total comes from real Payment rows (Stripe checkout,
  // payment links, POS mark-paid, record-payment) — so a draft/on-account
  // order with no payments shows the full balance due.
  // ponytail: counts authorized-not-yet-captured payments as paid; every
  // current flow auto-captures. Refunds ignored — the invoice documents the
  // sale as placed.
  const paid = typeof paidTotal === "number" ? round2(paidTotal) : null
  const balanceDue = paid === null ? null : round2(Math.max(0, grandTotal - paid))
  const meta = (raw?.metadata ?? {}) as Record<string, unknown>
  const dueAt = typeof meta.balance_due_at === "string" ? meta.balance_due_at : null

  return {
    ...raw,
    items,
    item_subtotal: itemSubtotal,
    shipping_subtotal: shippingSubtotal,
    tax_total: taxTotal,
    total: grandTotal,
    gst_included: gstIncluded,
    paid_total: paid,
    balance_due: balanceDue,
    due_at: dueAt,
  }
}

/**
 * Loads an order shaped for the invoice/receipt PDF with reconciled totals.
 * Every invoice surface (email subscriber, admin re-send/preview, account
 * download) must load through this so they render identical numbers.
 */
export async function loadReceiptOrder(
  container: MedusaContainer,
  orderId: string
): Promise<ReceiptOrder | null> {
  const orderModule = container.resolve(Modules.ORDER) as IOrderModuleService
  let raw: any
  try {
    raw = await orderModule.retrieveOrder(orderId, {
      relations: [
        "items",
        "summary",
        "shipping_address",
        "billing_address",
        "shipping_methods",
      ],
    })
  } catch {
    return null
  }

  // Order↔PaymentCollection is a module link — read via query.graph (same
  // pattern as payment-mix report; payment.amount is a stored column, not a
  // decorated aggregate, so graph returns it correctly).
  let paidTotal: number | null = null
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: ["id", "payment_collections.payments.amount"],
    })
    const collections = (data?.[0]?.payment_collections ?? []) as any[]
    paidTotal = collections.reduce(
      (sum: number, c: any) =>
        sum +
        ((c?.payments ?? []) as any[]).reduce(
          (s: number, p: any) => s + toNumber(p?.amount),
          0
        ),
      0
    )
  } catch {
    // unknown payment state → PDF omits the paid/balance block
  }

  return computeReceiptTotals(raw, paidTotal)
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

const round2 = (n: number): number => Math.round(n * 100) / 100

function formatMoney(
  value: number | string | null | undefined,
  currency: string
): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: (currency || "AUD").toUpperCase(),
  }).format(toNumber(value))
}

function formatDate(d: Date | string | null | undefined): string {
  const date = d ? (typeof d === "string" ? new Date(d) : d) : new Date()
  return date.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function getCustomizerPricing(item: OrderItem): LineItemPricing | null {
  const raw = item.metadata?.customizerDesign as CustomizerDesign | undefined
  return raw?.pricing ?? null
}

async function tintLogo(logoBuf: Buffer, size: number, hex: string): Promise<Buffer> {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const { data, info } = await sharp(logoBuf)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = info.width * info.height
  for (let i = 0; i < pixels; i++) {
    if (data[i * 4 + 3] > 0) {
      data[i * 4] = r
      data[i * 4 + 1] = g
      data[i * 4 + 2] = b
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()
}

export async function generateReceiptPdf(
  order: ReceiptOrder
): Promise<Buffer> {
  const regularFontBuf = fs.readFileSync(
    path.join(FONTS_DIR, "PlusJakartaSans-Regular.woff")
  )
  const boldFontBuf = fs.readFileSync(
    path.join(FONTS_DIR, "PlusJakartaSans-Bold.woff")
  )
  const rawLogoBuf = fs.readFileSync(
    path.join(IMAGES_DIR, "sc-prints-logo.png")
  )
  const logoTinted = await tintLogo(rawLogoBuf, 200, BRAND_SECONDARY)

  return buildPdf({ order, regularFontBuf, boldFontBuf, logoBuf: logoTinted })
}

function buildPdf(params: {
  order: ReceiptOrder
  regularFontBuf: Buffer
  boldFontBuf: Buffer
  logoBuf: Buffer
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { order, regularFontBuf, boldFontBuf, logoBuf } = params

    const doc = new PDFDocument({ size: "A4", margin: 0 })
    doc.registerFont("PJS", regularFontBuf)
    doc.registerFont("PJS-Bold", boldFontBuf)

    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const PW = 595.28
    const PH = 841.89
    const ML = 48
    const MR = 48
    const usableW = PW - ML - MR

    const currency = String(order.currency_code ?? "AUD").toUpperCase()
    const meta = (order.metadata ?? {}) as Record<string, unknown>
    const taxExempt = meta.tax_exempt === true
    const taxExemptReason =
      typeof meta.tax_exempt_reason === "string" ? meta.tax_exempt_reason : null
    const taxExemptAbn =
      typeof meta.tax_exempt_abn === "string" ? meta.tax_exempt_abn : null

    const shipping = (order.shipping_address ?? {}) as Address
    const billing = (order.billing_address ?? shipping) as Address

    const items = (order.items ?? []) as OrderItem[]
    const displayId = String(order.display_id ?? order.id)
    const dateStr = formatDate(order.created_at)

    // ── HEADER ─────────────────────────────────────────────────────────────
    const logoW = 56
    const logoH = 56
    doc.image(logoBuf, ML, 48, { width: logoW, height: logoH, fit: [logoW, logoH] })

    doc
      .font("PJS-Bold")
      .fontSize(20)
      .fillColor(BRAND_PRIMARY)
      .text("Tax Invoice", ML + logoW + 14, 56)

    doc
      .font("PJS")
      .fontSize(10)
      .fillColor(TEXT_MUTED)
      .text(`Order #${displayId}  ·  ${dateStr}`, ML + logoW + 14, 82)

    // Brand block right
    doc
      .font("PJS-Bold")
      .fontSize(12)
      .fillColor(BRAND_PRIMARY)
      .text("SC PRINTS", ML, 56, { width: usableW, align: "right" })
    doc
      .font("PJS")
      .fontSize(9)
      .fillColor(TEXT_MUTED)
      .text("info@scprints.com.au", ML, 72, { width: usableW, align: "right" })
    doc
      .font("PJS")
      .fontSize(9)
      .fillColor(TEXT_MUTED)
      .text("scprints.com.au", ML, 86, { width: usableW, align: "right" })

    if (SCP_COMPANY_ABN) {
      doc
        .font("PJS")
        .fontSize(9)
        .fillColor(TEXT_MUTED)
        .text(`ABN ${SCP_COMPANY_ABN}`, ML, 100, {
          width: usableW,
          align: "right",
        })
    }

    if (taxExempt) {
      doc
        .roundedRect(PW - MR - 150, 120, 150, 18, 9)
        .fill("#fef3c7")
      doc
        .font("PJS-Bold")
        .fontSize(9)
        .fillColor("#92400e")
        .text("No-GST · Tax exempt", PW - MR - 150, 125, {
          width: 150,
          align: "center",
        })
    }

    // ── ADDRESSES ──────────────────────────────────────────────────────────
    const addrY = 140
    const colW = (usableW - 24) / 2

    const renderAddressColumn = (
      label: string,
      x: number,
      addr: Address,
      extras: Array<string | null> = []
    ) => {
      doc
        .font("PJS-Bold")
        .fontSize(9)
        .fillColor(TEXT_MUTED)
        .text(label.toUpperCase(), x, addrY, { width: colW, characterSpacing: 0.6 })

      let y = addrY + 14
      const lines = [
        [addr.first_name, addr.last_name].filter(Boolean).join(" ").trim() ||
          (order.email ?? ""),
        addr.company ?? "",
        addr.address_1 ?? "",
        addr.address_2 ?? "",
        [addr.city, addr.province, addr.postal_code]
          .filter(Boolean)
          .join(" ")
          .trim(),
        addr.country_code ? addr.country_code.toUpperCase() : "",
        ...extras.filter(Boolean).map((s) => String(s)),
      ].filter(Boolean)

      doc.font("PJS").fontSize(10).fillColor(BRAND_PRIMARY)
      for (const line of lines) {
        doc.text(String(line), x, y, { width: colW })
        y += 13
      }
    }

    renderAddressColumn(
      "Bill to",
      ML,
      billing,
      [
        order.email ?? null,
        taxExemptAbn ? `ABN ${taxExemptAbn}` : null,
      ]
    )
    renderAddressColumn(
      "Ship to",
      ML + colW + 24,
      shipping,
      [shipping.phone ?? null]
    )

    // ── ITEMS TABLE ────────────────────────────────────────────────────────
    let tableY = 280

    // Table header
    doc
      .moveTo(ML, tableY)
      .lineTo(PW - MR, tableY)
      .lineWidth(0.5)
      .stroke(RULE_COLOR)

    const headerY = tableY + 8
    doc.font("PJS-Bold").fontSize(9).fillColor(TEXT_MUTED)
    doc.text("ITEM", ML, headerY, { width: usableW * 0.55 })
    doc.text("QTY", ML + usableW * 0.55, headerY, {
      width: usableW * 0.1,
      align: "right",
    })
    doc.text("UNIT", ML + usableW * 0.65, headerY, {
      width: usableW * 0.15,
      align: "right",
    })
    doc.text("TOTAL", ML + usableW * 0.8, headerY, {
      width: usableW * 0.2,
      align: "right",
    })

    tableY = headerY + 18
    doc
      .moveTo(ML, tableY)
      .lineTo(PW - MR, tableY)
      .lineWidth(0.5)
      .stroke(RULE_COLOR)

    let rowY = tableY + 10

    if (items.length === 0) {
      doc
        .font("PJS")
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text("No line items.", ML, rowY, { width: usableW, align: "center" })
      rowY += 20
    }

    for (const item of items) {
      // Page break safety: leave room for totals box
      if (rowY > PH - 280) {
        doc.addPage()
        rowY = 48
      }

      const title = String(item.title ?? item.product_title ?? "Item")
      const variant = item.variant_title ? String(item.variant_title) : ""
      const sku = item.variant_sku ? String(item.variant_sku) : ""
      const qty = Number(item.quantity ?? 0)
      const unit = formatMoney(item.unit_price, currency)
      const total = formatMoney(
        item.total ?? toNumber(item.unit_price) * qty,
        currency
      )
      const pricing = getCustomizerPricing(item)

      const itemColX = ML
      const itemColW = usableW * 0.55 - 8

      // Title
      doc
        .font("PJS-Bold")
        .fontSize(10.5)
        .fillColor(BRAND_PRIMARY)
        .text(title, itemColX, rowY, { width: itemColW })

      let detailY = rowY + Math.max(14, doc.heightOfString(title, { width: itemColW }))

      if (variant) {
        doc
          .font("PJS")
          .fontSize(9)
          .fillColor(TEXT_MUTED)
          .text(`Variant: ${variant}`, itemColX, detailY, { width: itemColW })
        detailY += 12
      }
      if (sku) {
        doc
          .font("PJS")
          .fontSize(9)
          .fillColor(TEXT_MUTED)
          .text(`SKU ${sku}`, itemColX, detailY, { width: itemColW })
        detailY += 12
      }

      if (pricing) {
        doc
          .font("PJS")
          .fontSize(9)
          .fillColor(TEXT_MUTED)
          .text("Custom design archived with print-ready assets.", itemColX, detailY, {
            width: itemColW,
          })
        detailY += 12
      }

      // Right-side qty / unit / total — vertically aligned to title row
      doc
        .font("PJS")
        .fontSize(10.5)
        .fillColor(BRAND_PRIMARY)
        .text(String(qty), ML + usableW * 0.55, rowY, {
          width: usableW * 0.1,
          align: "right",
        })
      doc.text(unit, ML + usableW * 0.65, rowY, {
        width: usableW * 0.15,
        align: "right",
      })
      doc
        .font("PJS-Bold")
        .fontSize(10.5)
        .text(total, ML + usableW * 0.8, rowY, {
          width: usableW * 0.2,
          align: "right",
        })

      rowY = Math.max(rowY + 24, detailY + 6)
      doc
        .moveTo(ML, rowY)
        .lineTo(PW - MR, rowY)
        .lineWidth(0.5)
        .stroke(RULE_COLOR)
      rowY += 10
    }

    // ── TOTALS ─────────────────────────────────────────────────────────────
    if (rowY > PH - 220) {
      doc.addPage()
      rowY = 48
    }

    const totalsX = ML + usableW * 0.45
    const totalsLabelW = usableW * 0.35
    const totalsAmountW = usableW * 0.2
    let totalsY = rowY + 6

    const writeTotalRow = (
      label: string,
      amount: string,
      opts: { bold?: boolean; rule?: boolean } = {}
    ) => {
      if (opts.rule) {
        doc
          .moveTo(totalsX, totalsY)
          .lineTo(PW - MR, totalsY)
          .lineWidth(1)
          .stroke(BRAND_PRIMARY)
        totalsY += 6
      }
      doc
        .font(opts.bold ? "PJS-Bold" : "PJS")
        .fontSize(opts.bold ? 12 : 10)
        .fillColor(BRAND_PRIMARY)
        .text(label, totalsX, totalsY, { width: totalsLabelW })
      doc
        .font(opts.bold ? "PJS-Bold" : "PJS")
        .fontSize(opts.bold ? 12 : 10)
        .fillColor(BRAND_PRIMARY)
        .text(amount, totalsX + totalsLabelW, totalsY, {
          width: totalsAmountW,
          align: "right",
        })
      totalsY += opts.bold ? 22 : 18
    }

    // GST-inclusive (embedded) when the order carries no itemised GST but is a
    // taxable sale; GST-exclusive (added on top) when the order itemised it.
    const gstIncluded = (order.gst_included ?? false) && !taxExempt
    const exLabel = gstIncluded ? "" : " (ex GST)"

    const itemsSubtotal = order.item_subtotal ?? order.subtotal
    writeTotalRow(`Subtotal${exLabel}`, formatMoney(itemsSubtotal, currency))

    const shippingSubtotal = toNumber(order.shipping_subtotal ?? order.shipping_total)
    if (shippingSubtotal > 0) {
      writeTotalRow(`Shipping${exLabel}`, formatMoney(shippingSubtotal, currency))
    }

    if (taxExempt) {
      writeTotalRow("GST (exempt)", formatMoney(0, currency))
      writeTotalRow(
        `Total ${currency}`,
        formatMoney(toNumber(order.total) - toNumber(order.tax_total), currency),
        { bold: true, rule: true }
      )
    } else {
      // GST sits between Shipping and Total either way. When GST is embedded
      // (pre-config orders) the lines above are GST-inclusive, so the total is
      // labelled "(inc. GST)" rather than summing ex-GST lines + GST.
      writeTotalRow("GST", formatMoney(order.tax_total, currency))
      writeTotalRow(
        `Total ${currency}${gstIncluded ? " (inc. GST)" : ""}`,
        formatMoney(order.total, currency),
        { bold: true, rule: true }
      )
    }

    // ── PAYMENT STATE ──────────────────────────────────────────────────────
    // Rendered only when the payments query succeeded. Paid orders get a
    // "PAID" badge; orders carrying a balance get the amount owing, the due
    // date (deposit widget's balance_due_at), and bank-transfer details.
    const paidTotal = order.paid_total
    const balanceDue = order.balance_due
    if (typeof paidTotal === "number" && typeof balanceDue === "number") {
      writeTotalRow("Amount paid", formatMoney(paidTotal, currency))
      if (balanceDue <= 0.005) {
        doc.roundedRect(PW - MR - 90, totalsY, 90, 20, 10).fill("#dcfce7")
        doc
          .font("PJS-Bold")
          .fontSize(10)
          .fillColor("#166534")
          .text("PAID", PW - MR - 90, totalsY + 5, {
            width: 90,
            align: "center",
          })
        totalsY += 28
      } else {
        writeTotalRow("Balance due", formatMoney(balanceDue, currency), {
          bold: true,
        })

        totalsY += 4
        doc
          .font("PJS-Bold")
          .fontSize(9)
          .fillColor(TEXT_MUTED)
          .text("PAYMENT", ML, totalsY, { characterSpacing: 0.6 })
        totalsY += 14
        doc.font("PJS").fontSize(10).fillColor(BRAND_PRIMARY)
        if (order.due_at) {
          doc
            .font("PJS-Bold")
            .text(`Due by ${formatDate(order.due_at)}`, ML, totalsY)
          doc.font("PJS")
          totalsY += 14
        }
        if (SCP_BANK_BSB && SCP_BANK_ACCOUNT_NUMBER) {
          const bankLines = [
            `Pay by bank transfer to: ${SCP_BANK_ACCOUNT_NAME}`,
            `BSB ${SCP_BANK_BSB}  ·  Account ${SCP_BANK_ACCOUNT_NUMBER}`,
            `Reference: Order #${displayId}`,
          ]
          for (const line of bankLines) {
            doc.text(line, ML, totalsY)
            totalsY += 14
          }
        }
      }
    }

    // ── DELIVERY ───────────────────────────────────────────────────────────
    const methods = order.shipping_methods ?? []
    if (methods.length > 0) {
      totalsY += 8
      doc
        .font("PJS-Bold")
        .fontSize(9)
        .fillColor(TEXT_MUTED)
        .text("DELIVERY", ML, totalsY, { characterSpacing: 0.6 })
      totalsY += 14
      for (const m of methods) {
        const name = m.name ? String(m.name) : "Shipping"
        const amount = formatMoney(m.amount, currency)
        doc
          .font("PJS")
          .fontSize(10)
          .fillColor(BRAND_PRIMARY)
          .text(`${name}  ·  ${amount}`, ML, totalsY)
        totalsY += 14
      }
    }

    if (taxExempt && taxExemptReason) {
      totalsY += 10
      doc
        .font("PJS")
        .fontSize(8.5)
        .fillColor(TEXT_MUTED)
        .text(
          `This is a no-GST tax invoice issued to a tax-exempt customer: ${taxExemptReason}.`,
          ML,
          totalsY,
          { width: usableW }
        )
    }

    // ── FOOTER ─────────────────────────────────────────────────────────────
    const footerY = PH - 36
    doc
      .font("PJS")
      .fontSize(8)
      .fillColor(TEXT_MUTED)
      .text(
        `Generated ${new Date().toLocaleString("en-AU")}  ·  SC PRINTS  ·  ${order.id}`,
        ML,
        footerY,
        { width: usableW, align: "center" }
      )

    doc.end()
  })
}
