import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Report-alert `threshold` / `last_value` are now `model.bigNumber()` (decimal)
 * instead of `model.number()` (integer), so fractional thresholds (e.g. an
 * SLA-breach % of 5.5) aren't truncated. The underlying columns were already
 * hand-migrated as `numeric`, so the only schema change is the paired
 * `raw_<field>` jsonb columns Medusa's bigNumber field expects.
 *
 * No backfill: the bigNumber getter reads the `numeric` column first and only
 * falls back to `raw_<field>` when the numeric value is null — so existing rows
 * (numeric present, raw_ null) keep reading correctly, and the next write
 * populates both columns.
 */
export class Migration20270610000001 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "report_alert" ' +
        'add column if not exists "raw_threshold" jsonb null, ' +
        'add column if not exists "raw_last_value" jsonb null;'
    )
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "report_alert" ' +
        'drop column if exists "raw_threshold", ' +
        'drop column if exists "raw_last_value";'
    )
  }
}
