import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Saved designs can be shared with one organisation the owner belongs to. */
export class Migration20261119100100 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table if exists "design" add column if not exists "organisation_id" text null;')
    this.addSql(
      'create index if not exists "IDX_design_organisation_id" on "design" ("organisation_id") where "deleted_at" is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop index if exists "IDX_design_organisation_id";')
    this.addSql('alter table if exists "design" drop column if exists "organisation_id";')
  }
}
