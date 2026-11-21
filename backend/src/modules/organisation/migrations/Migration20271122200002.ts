import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Organisation brand kit (colours, fonts, placement notes, official logos). */
export class Migration20271122200002 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "organisation" add column if not exists "brand_kit" jsonb not null default \'{}\'::jsonb;')
  }

  async down(): Promise<void> {
    this.addSql('alter table "organisation" drop column if exists "brand_kit";')
  }
}
