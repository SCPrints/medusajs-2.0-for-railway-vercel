import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Add `job_slug` so several photos of one job group into a single
 * `/lookbook/<job_slug>` page, and backfill it from the title. The SQL slug
 * mirrors `slugifyJob` in src/lib/lookbook-job-slug.ts — keep the two in sync.
 */
export class Migration20271016000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table if exists "lookbook_item" add column if not exists "job_slug" text null;'
    )
    this.addSql(
      'CREATE INDEX IF NOT EXISTS "IDX_lookbook_item_job_slug" ON "lookbook_item" (job_slug) WHERE deleted_at IS NULL;'
    )
    this.addSql(
      `update "lookbook_item" set "job_slug" = nullif(trim(both '-' from regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g')), '') where "job_slug" is null;`
    )
  }

  async down(): Promise<void> {
    this.addSql('DROP INDEX IF EXISTS "IDX_lookbook_item_job_slug";')
    this.addSql(
      'alter table if exists "lookbook_item" drop column if exists "job_slug";'
    )
  }
}
