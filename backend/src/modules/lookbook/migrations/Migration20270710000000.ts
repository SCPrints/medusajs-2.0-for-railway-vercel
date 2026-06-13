import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Add `product_handles` to lookbook tiles so staff can link a photo of a real
 * job to the actual garment(s) — the storefront "Start a job like this" CTA
 * deep-links to the product PDP when present. Handle-based (not id) so the link
 * survives supplier re-imports, matching the bundles + home-sections pattern.
 */
export class Migration20270710000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table if exists "lookbook_item" add column if not exists "product_handles" jsonb not null default \'{}\'::jsonb;'
    )
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table if exists "lookbook_item" drop column if exists "product_handles";'
    )
  }
}
