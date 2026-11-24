import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Allowance kinds (one-off batch / ongoing new-starter packs) and home delivery (gift links). */
export class Migration20271125000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`alter table if exists "organisation_allowance" add column if not exists "kind" text check ("kind" in ('batch', 'ongoing')) not null default 'batch';`)
    this.addSql(`alter table if exists "organisation_allowance" add column if not exists "delivery" text check ("delivery" in ('bulk', 'home')) not null default 'bulk';`)
    this.addSql(`alter table if exists "organisation_allowance_pick" add column if not exists "address" jsonb null;`)
    this.addSql(`alter table if exists "organisation_allowance_pick" add column if not exists "cart_id" text null;`)
  }

  async down(): Promise<void> {
    this.addSql(`alter table if exists "organisation_allowance" drop column if exists "kind", drop column if exists "delivery";`)
    this.addSql(`alter table if exists "organisation_allowance_pick" drop column if exists "address", drop column if exists "cart_id";`)
  }
}
