import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20271128100000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table if exists "group_order" add column if not exists "organisation_id" text null;')
  }

  async down(): Promise<void> {
    this.addSql('alter table if exists "group_order" drop column if exists "organisation_id";')
  }
}
