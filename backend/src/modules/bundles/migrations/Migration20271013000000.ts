import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20271013000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table if exists "bundle" add column if not exists "discount_pct" integer not null default 0;'
    )
    this.addSql(
      'alter table if exists "bundle_item" add column if not exists "print_positions" jsonb null;'
    )
    this.addSql(
      'alter table if exists "bundle_item" add column if not exists "choices" jsonb null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('alter table if exists "bundle" drop column if exists "discount_pct";')
    this.addSql('alter table if exists "bundle_item" drop column if exists "print_positions";')
    this.addSql('alter table if exists "bundle_item" drop column if exists "choices";')
  }
}
