import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ulid } from "ulid"

import { ADMIN_PUBLIC_URL, BACKEND_URL } from "./constants"
import { mapQuoteDesignLines } from "./quote-design-lines"
import { archiveLineDesigns } from "./side-layouts-archive"
import { QUOTE_MODULE } from "../modules/quote"
import type QuoteModuleService from "../modules/quote/service"

/**
 * Unfinished carts, surfaced to staff. Medusa's admin has no cart view, so a
 * customer who designs in the Studio and then enquires ("my designs are in the
 * cart") was invisible without a DB query. One lookup powers the enquiry email,
 * the /app/open-carts page (Customers → Open carts), the customer widget and the cmd-K palette.
 *
 * Raw SQL on purpose: the line metadata carries the full Fabric payload (MBs on
 * vector designs), so we pull only the artwork URLs out of the jsonb.
 */

export type OpenCartFile = { label: string; url: string }

export type OpenCartLine = {
  id: string
  title: string
  variant_title: string | null
  quantity: number
  unit_price: number
  thumbnail: string | null
  has_design: boolean
  print_notes: string | null
  files: OpenCartFile[]
}

export type OpenCart = {
  id: string
  email: string | null
  customer_id: string | null
  customer_name: string | null
  currency_code: string
  created_at: string
  updated_at: string
  item_total: number
  quote_id: string | null
  admin_url: string
  lines: OpenCartLine[]
}

const SIDE_LABEL: Record<string, string> = {
  front: "Front",
  back: "Back",
  left_sleeve: "Left sleeve",
  right_sleeve: "Right sleeve",
  printed_tag: "Neck tag",
}

const sideLabel = (side: unknown) =>
  SIDE_LABEL[String(side)] ?? String(side ?? "").replace(/_/g, " ")

/** Artwork links staff need, from a line's customizerDesign fragments. */
export function lineFiles(artifacts: unknown, originals: unknown): OpenCartFile[] {
  const files: OpenCartFile[] = []
  for (const a of Array.isArray(artifacts) ? artifacts : []) {
    if (typeof a?.mockupUrl === "string" && a.mockupUrl)
      files.push({ label: `Mockup (${sideLabel(a.side)})`, url: a.mockupUrl })
    if (typeof a?.printUrl === "string" && a.printUrl)
      files.push({ label: `Print file (${sideLabel(a.side)})`, url: a.printUrl })
  }
  for (const o of Array.isArray(originals) ? originals : []) {
    if (typeof o?.url === "string" && o.url)
      files.push({ label: `Customer upload: ${o.fileName || "file"}`, url: o.url })
  }
  return files
}

export const openCartAdminUrl = (cartId: string) =>
  `${(ADMIN_PUBLIC_URL || BACKEND_URL).replace(/\/+$/, "")}/app/open-carts?q=${encodeURIComponent(cartId)}`

export type OpenCartQuery = { q: string; limit?: number }

/**
 * `q` is an email (exact if it has "@", else partial), `cart_…`, `cali_…`
 * (cart line — what AI agents quote back at us) or `cus_…`. Empty `q` lists the
 * most recently active open carts with an email (90-day window).
 */
export async function findOpenCarts(container: any, { q, limit = 25 }: OpenCartQuery): Promise<OpenCart[]> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const term = q.trim()

  const carts = knex("cart as c")
    .leftJoin("customer as cu", "cu.id", "c.customer_id")
    .whereNull("c.completed_at")
    .whereNull("c.deleted_at")
    .whereExists(
      knex("cart_line_item as li").select(1).whereRaw("li.cart_id = c.id").whereNull("li.deleted_at")
    )
    .select(
      "c.id",
      "c.email",
      "c.customer_id",
      "c.currency_code",
      "c.created_at",
      "c.updated_at",
      knex.raw("c.metadata->>'requested_quote_id' as quote_id"),
      knex.raw("nullif(trim(concat_ws(' ', cu.first_name, cu.last_name)), '') as customer_name")
    )
    .orderBy("c.updated_at", "desc")
    .limit(limit)

  if (term.startsWith("cart_")) carts.where("c.id", term)
  else if (term.startsWith("cali_"))
    carts.whereIn("c.id", knex("cart_line_item").select("cart_id").where("id", term))
  else if (term.startsWith("cus_")) carts.where("c.customer_id", term)
  else if (term.includes("@"))
    carts.where((w: any) =>
      w.whereRaw("lower(c.email) = ?", [term.toLowerCase()]).orWhereRaw("lower(cu.email) = ?", [term.toLowerCase()])
    )
  else if (term.length >= 3)
    carts.where((w: any) =>
      w
        .whereRaw("c.email ilike ?", [`%${term.replace(/[%_]/g, "")}%`])
        .orWhereRaw("concat_ws(' ', cu.first_name, cu.last_name) ilike ?", [`%${term.replace(/[%_]/g, "")}%`])
    )
  else carts.whereNotNull("c.email").whereRaw("c.updated_at > now() - interval '90 days'")

  const rows: any[] = await carts
  if (!rows.length) return []

  const lineRows: any[] = await knex("cart_line_item")
    .whereIn(
      "cart_id",
      rows.map((r) => r.id)
    )
    .whereNull("deleted_at")
    .orderBy("created_at", "asc")
    .select(
      "id",
      "cart_id",
      "title",
      "variant_title",
      "quantity",
      "unit_price",
      "thumbnail",
      knex.raw("metadata \\? 'customizerDesign' as has_design"), // `\\?` = jsonb key-exists, not a knex binding
      knex.raw("metadata->'customizerDesign'->'artifacts' as artifacts"),
      knex.raw("metadata->'customizerDesign'->'customerOriginalFiles' as originals"),
      knex.raw("metadata->'customizerDesign'->>'printNotes' as print_notes")
    )

  return rows.map((r) => {
    const lines: OpenCartLine[] = lineRows
      .filter((l) => l.cart_id === r.id)
      .map((l) => {
        const files = lineFiles(l.artifacts, l.originals)
        return {
          id: l.id,
          title: l.title,
          variant_title: l.variant_title ?? null,
          quantity: Number(l.quantity) || 0,
          unit_price: Number(l.unit_price) || 0,
          thumbnail: files.find((f) => f.label.startsWith("Mockup"))?.url ?? l.thumbnail ?? null,
          has_design: Boolean(l.has_design),
          print_notes: l.print_notes || null,
          files,
        }
      })
    return {
      id: r.id,
      email: r.email ?? null,
      customer_id: r.customer_id ?? null,
      customer_name: r.customer_name ?? null,
      currency_code: r.currency_code ?? "aud",
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
      // ponytail: items only (inc GST) — shipping isn't chosen until checkout.
      item_total: Math.round(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0) * 100) / 100,
      quote_id: r.quote_id ?? null,
      admin_url: openCartAdminUrl(r.id),
      lines,
    }
  })
}

/**
 * Copy an open cart into a `new` quote so staff can proof it and send the
 * existing accept / payment link. Each customiser line becomes its own design
 * group carrying the full customizerDesign, priced at what the cart showed
 * (staff can still edit before sending). Idempotent: the quote id is stamped on
 * `cart.metadata.requested_quote_id`, and a second call returns that quote.
 */
export async function createQuoteFromCart(
  container: any,
  cartId: string,
  opts: { source: "admin" | "cart"; actor: string; note?: string | null; contactName?: string | null; contactPhone?: string | null }
): Promise<{ quote_id: string; public_id: string; created: boolean }> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const quoteService = container.resolve(QUOTE_MODULE) as QuoteModuleService

  const cart = await knex("cart as c")
    .leftJoin("customer as cu", "cu.id", "c.customer_id")
    .where("c.id", cartId)
    .whereNull("c.deleted_at")
    .first(
      "c.id",
      "c.email",
      "c.customer_id",
      "c.completed_at",
      "c.metadata",
      "c.currency_code",
      "cu.email as customer_email",
      "cu.first_name",
      "cu.last_name",
      "cu.phone"
    )
  if (!cart) throw Object.assign(new Error("Cart not found"), { status: 404 })
  if (cart.completed_at) throw Object.assign(new Error("Cart has already been checked out"), { status: 409 })

  const existingId = cart.metadata?.requested_quote_id
  if (existingId) {
    try {
      const q: any = await quoteService.retrieveQuote(existingId)
      return { quote_id: q.id, public_id: q.public_id, created: false }
    } catch {
      /* quote deleted — make a fresh one */
    }
  }

  const email = (cart.email || cart.customer_email || "").toLowerCase()
  if (!email) throw Object.assign(new Error("Cart has no email address yet"), { status: 422 })

  const lines: any[] = await knex("cart_line_item")
    .where("cart_id", cartId)
    .whereNull("deleted_at")
    .orderBy("created_at", "asc")
    .select("id", "title", "variant_title", "quantity", "unit_price", "product_id", "variant_id", "product_handle", "metadata")
  if (!lines.length) throw Object.assign(new Error("Cart is empty"), { status: 422 })

  const items = lines.flatMap((l) => {
    const design = l.metadata?.customizerDesign ?? null
    return mapQuoteDesignLines(
      [
        {
          kind: design ? "customizer" : "standard",
          variant_id: l.variant_id ?? null,
          product_id: l.product_id ?? "",
          product_title: l.title,
          variant_title: l.variant_title ?? null,
          quantity: Number(l.quantity) || 1,
          unit_price_cents: Math.round((Number(l.unit_price) || 0) * 100),
          metadata: {
            customizerDesign: design,
            product_handle: l.product_handle ?? null,
            print_size_id: design?.scpPrintSizeId ?? null,
          },
        },
      ],
      String(design?.group_id || l.id)
    )
  })

  const publicId = `Q-${ulid().slice(-10).toUpperCase()}`
  // Heavy vector sideLayouts → R2 so the quote row doesn't carry MBs per line.
  await archiveLineDesigns(container, items, `cart-${publicId}`)

  const total = items.reduce((s, i) => s + (i.total ?? 0), 0)
  const contactName =
    opts.contactName?.trim() || [cart.first_name, cart.last_name].filter(Boolean).join(" ") || null
  const message = [
    `Created from website cart ${cartId} (${opts.source === "cart" ? "customer requested a proof / quote" : "converted by staff"}).`,
    ...lines.map((l) => `• ${l.quantity} × ${l.title}${l.variant_title ? ` — ${l.variant_title}` : ""}`),
    ...(opts.note?.trim() ? ["", `Customer note: ${opts.note.trim()}`] : []),
  ].join("\n")

  const [quote] = await quoteService.createQuotes([
    {
      public_id: publicId,
      status: "new",
      source: "cart" as any,
      email,
      customer_id: cart.customer_id ?? null,
      contact_name: contactName,
      contact_phone: opts.contactPhone?.trim() || cart.phone || null,
      subject: `Website cart — ${lines.length} line${lines.length === 1 ? "" : "s"}`,
      message,
      currency_code: cart.currency_code ?? "aud",
      total_estimate: Math.round(total * 100) / 100,
      line_items: { items },
      metadata: { source_cart_id: cartId },
    } as any,
  ])

  await quoteService.createQuoteEvents([
    { quote_id: quote.id, type: "created", actor: opts.actor, body: { source: "cart", cart_id: cartId, line_count: items.length } },
  ])

  // Stamp the cart (spread — a jsonb update replaces the whole object).
  await knex("cart")
    .where("id", cartId)
    .update({ metadata: { ...(cart.metadata ?? {}), requested_quote_id: quote.id } })

  return { quote_id: quote.id, public_id: publicId, created: true }
}
