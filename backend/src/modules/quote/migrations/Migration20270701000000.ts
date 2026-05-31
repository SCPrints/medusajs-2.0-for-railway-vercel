import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Backfill the `raw_total_estimate` jsonb column on any environment whose
 * `quote` table predates the fix to Migration20260618000000.
 *
 * `total_estimate` is declared `model.bigNumber()`, which always generates a
 * paired `raw_total_estimate` persisted property. MikroORM includes it in
 * every SELECT, so a `quote` table missing the column throws
 * `column "raw_total_estimate" does not exist` on every list/retrieve.
 * The create-table migration originally omitted it; this idempotent ALTER
 * repairs existing DBs (no-op where the column already exists).
 */
export class Migration20270701000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table if exists "quote" add column if not exists "raw_total_estimate" jsonb null;'
    )
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table if exists "quote" drop column if exists "raw_total_estimate";'
    )
  }
}
