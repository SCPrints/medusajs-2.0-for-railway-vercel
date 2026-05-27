import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Phase 1 of the customer fulfillment service — creates the
 * `organisation_design` table.
 *
 * One row per pre-approved brand artwork file belonging to an org.
 * `org_inventory` rows reference these via `organisation_design_id`.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → data model § 1.
 */
export class Migration20270601000001 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "organisation_design" (' +
        '"id" text not null, ' +
        '"organisation_id" text not null, ' +
        '"name" text not null, ' +
        '"code" text null, ' +
        '"thumbnail_url" text not null, ' +
        '"print_file_url" text null, ' +
        '"customizer_metadata" jsonb null, ' +
        '"is_active" boolean not null default true, ' +
        '"metadata" jsonb not null default \'{}\'::jsonb, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "organisation_design_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_design_org_id" ' +
        'on "organisation_design" ("organisation_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_design_org_active" ' +
        'on "organisation_design" ("organisation_id", "is_active") where "deleted_at" is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "organisation_design" cascade;')
  }
}
