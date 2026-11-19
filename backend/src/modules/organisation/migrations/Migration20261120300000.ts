import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Organisation roster ("People") — Docs/CUSTOMER_PORTAL_EXTRAS_2026_11.md § C. */
export class Migration20261120300000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "organisation_roster_member" (' +
        '"id" text not null, ' +
        '"organisation_id" text not null, ' +
        '"name" text not null, ' +
        '"unit" text null, ' +
        '"number" text null, ' +
        '"sizes" jsonb not null default \'{}\'::jsonb, ' +
        '"notes" text null, ' +
        '"is_active" boolean not null default true, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "organisation_roster_member_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_roster_member_organisation_id" ' +
        'on "organisation_roster_member" ("organisation_id") where "deleted_at" is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "organisation_roster_member" cascade;')
  }
}
