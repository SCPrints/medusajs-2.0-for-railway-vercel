import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Uniform allowance (Docs/CUSTOMER_PORTAL_EXTRAS_2026_11.md): allowance + per-person pick rows. */
export class Migration20271122200000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "organisation_allowance" (' +
        '"id" text not null, "organisation_id" text not null, "name" text not null, "unit" text null, ' +
        '"closes_at" timestamptz null, "status" text check ("status" in (\'open\', \'closed\')) not null default \'open\', ' +
        '"items" jsonb not null default \'[]\'::jsonb, "cart_id" text null, "created_by" text not null, ' +
        '"created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, ' +
        'constraint "organisation_allowance_pkey" primary key ("id"));'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_allowance_organisation_id" on "organisation_allowance" ("organisation_id") where "deleted_at" is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "organisation_allowance" cascade;')
  }
}
