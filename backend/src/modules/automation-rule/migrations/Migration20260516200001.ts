import { Migration } from "@medusajs/framework/mikro-orm/migrations"

// NOTE: timestamp bumped from ...200000 to ...200001 to avoid a global
// migration-name collision with admin-workspace's Migration20260516200000.
// Medusa keys migrations by name across ALL modules in one shared
// mikro_orm_migrations table, so two identically-named migrations silently
// skip the second — leaving automation_rule uncreated on a fresh DB. Every
// statement is IF NOT EXISTS, so re-running on an existing DB is a no-op.
// Same class of fix as commit 69c57550 (pos_session vs admin-workspace).
export class Migration20260516200001 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "automation_rule" (' +
        '"id" text not null, ' +
        '"name" text not null, ' +
        '"trigger_event" text not null, ' +
        '"conditions" jsonb null, ' +
        '"actions" jsonb not null, ' +
        '"enabled" boolean not null default true, ' +
        '"last_fired_at" text null, ' +
        '"fire_count" integer not null default 0, ' +
        '"created_by" text null, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "automation_rule_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create index if not exists "IDX_automation_rule_trigger" on "automation_rule" ("trigger_event") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_automation_rule_enabled" on "automation_rule" ("enabled") where "deleted_at" is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "automation_rule" cascade;')
  }
}
