import { model } from "@medusajs/framework/utils"

/**
 * Top-level organisation entity — a school, sports club, business,
 * or any grouping of customers that orders together. Companies/teams
 * are first-class so:
 *   - Customers can see "your team's orders" alongside their own
 *   - Pricing can be set per-org (price_list pointer in metadata)
 *   - Multiple sub-users can place orders against the same org
 *   - Org-level brand kit (logos, embroidery files) is shared
 *
 * `handle` is URL-safe (e.g. `marrickville-lions`), used in
 * routing if/when we add an org public page later.
 *
 * `default_pricing_tier` is freeform for v1 — set to "vip" /
 * "wholesale" / etc. Tied later to Medusa price_lists.
 *
 * The `tax_exempt` snapshot mirrors the per-customer flag so
 * tax invoices for org orders render correctly.
 */
const Organisation = model
  .define("organisation", {
    id: model.id({ prefix: "org" }).primaryKey(),
    handle: model.text(),
    name: model.text(),
    abn: model.text().nullable(),
    contact_email: model.text().nullable(),
    contact_phone: model.text().nullable(),
    notes: model.text().nullable(),
    default_pricing_tier: model.text().nullable(),
    tax_exempt: model.boolean().default(false),
    tax_exempt_reason: model.text().nullable(),
    // Customer-of-record for fulfillment orders placed against this org.
    // Required (form-level guard) for any org that has inventory rows.
    // See Docs/FULFILLMENT_PHASE_1_SPEC.md → "Resolved decisions Q1".
    primary_contact_customer_id: model.text().nullable(),
    // Buying on account (staff-controlled; Docs/CUSTOMER_PORTAL_EXTRAS_2026_11.md § A).
    // credit_limit is AUD inc GST; null = no limit.
    account_terms_enabled: model.boolean().default(false),
    account_terms_days: model.number().default(30),
    credit_limit: model.bigNumber().nullable(),
    // Accounts-payable inbox: tax invoices for this org's orders are also sent here.
    ap_email: model.text().nullable(),
    // Approved colours / fonts / placement notes / official logos (lib/brand-kit.ts).
    brand_kit: model.json().default({}),
    metadata: model.json().default({}),
  })
  .indexes([{ on: ["handle"], unique: true }])

export default Organisation
