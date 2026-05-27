import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Phase 1 of the customer fulfillment service — add the
 * `primary_contact_customer_id` field on the `organisation` table.
 *
 * Nullable for back-compat (existing orgs not yet onboarded into the
 * fulfillment service stay valid). Form-level guard in the admin order
 * entry refuses to submit without it set.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → "Resolved decisions Q1".
 */
export class Migration20270601000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table if exists "organisation" ' +
        'add column if not exists "primary_contact_customer_id" text null;'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_primary_contact" ' +
        'on "organisation" ("primary_contact_customer_id") ' +
        'where "deleted_at" is null and "primary_contact_customer_id" is not null;'
    )
  }

  async down(): Promise<void> {
    this.addSql(
      'drop index if exists "IDX_organisation_primary_contact";'
    )
    this.addSql(
      'alter table if exists "organisation" drop column if exists "primary_contact_customer_id";'
    )
  }
}
