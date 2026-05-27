import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Phase 1 of the customer fulfillment service — creates the
 * `organisation_destination` table.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → data model § 2.
 */
export class Migration20270601000002 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "organisation_destination" (' +
        '"id" text not null, ' +
        '"organisation_id" text not null, ' +
        '"name" text not null, ' +
        '"code" text null, ' +
        '"address_1" text not null, ' +
        '"address_2" text null, ' +
        '"city" text not null, ' +
        '"province" text null, ' +
        '"postal_code" text not null, ' +
        '"country_code" text not null default \'au\', ' +
        '"contact_name" text null, ' +
        '"contact_phone" text null, ' +
        '"contact_email" text null, ' +
        '"delivery_notes" text null, ' +
        '"is_active" boolean not null default true, ' +
        '"metadata" jsonb not null default \'{}\'::jsonb, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "organisation_destination_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_destination_org_id" ' +
        'on "organisation_destination" ("organisation_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_destination_org_active" ' +
        'on "organisation_destination" ("organisation_id", "is_active") where "deleted_at" is null;'
    )
    this.addSql(
      'create unique index if not exists "IDX_organisation_destination_org_code" ' +
        'on "organisation_destination" ("organisation_id", "code") ' +
        'where "deleted_at" is null and "code" is not null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "organisation_destination" cascade;')
  }
}
