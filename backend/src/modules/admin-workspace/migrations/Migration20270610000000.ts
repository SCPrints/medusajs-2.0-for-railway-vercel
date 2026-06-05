import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * CRM Phase 8 follow-up — dedupe GLOBAL email-suppression rows.
 *
 * The existing unique index on `(email, template_kind)` does NOT constrain
 * global rows (`template_kind IS NULL`), because Postgres treats `NULL <> NULL`
 * — so two global unsubscribes for the same email can both insert under a
 * concurrent race (both pre-checks find nothing). This adds a partial unique
 * index enforcing at most one live global row per email, after collapsing any
 * pre-existing duplicates down to the earliest (smallest ULID) per email.
 *
 * Per-stream rows (`template_kind` non-null) are still covered by the original
 * `(email, template_kind)` index and are untouched here.
 */
export class Migration20270610000000 extends Migration {
  async up(): Promise<void> {
    // Collapse existing duplicate global rows so the unique index can be built.
    // ULIDs are time-ordered, so keeping the smallest id keeps the earliest row.
    this.addSql(
      'delete from "email_suppression" a ' +
        'using "email_suppression" b ' +
        "where a.template_kind is null and b.template_kind is null " +
        "and a.deleted_at is null and b.deleted_at is null " +
        "and a.email = b.email and a.id > b.id;"
    )
    this.addSql(
      'create unique index if not exists "IDX_email_suppression_email_global_unique" ' +
        'on "email_suppression" ("email") ' +
        'where "template_kind" is null and "deleted_at" is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql(
      'drop index if exists "IDX_email_suppression_email_global_unique";'
    )
  }
}
