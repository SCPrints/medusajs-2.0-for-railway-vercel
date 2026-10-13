import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20271013000001 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table if exists "group_order" add column if not exists "bundle_id" text null;')
    this.addSql('alter table if exists "group_order" add column if not exists "bundle_config" jsonb null;')
    this.addSql(
      'alter table if exists "group_order_participant" add column if not exists "bundle_sizes" jsonb null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('alter table if exists "group_order" drop column if exists "bundle_id";')
    this.addSql('alter table if exists "group_order" drop column if exists "bundle_config";')
    this.addSql('alter table if exists "group_order_participant" drop column if exists "bundle_sizes";')
  }
}
