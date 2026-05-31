import { Migration } from "@medusajs/framework/mikro-orm/migrations"

// NOTE: timestamp bumped from ...000000 to ...000001 to avoid a global
// migration-name collision with search-log's Migration20260509000000.
// Medusa keys migrations by name across ALL modules in one shared
// mikro_orm_migrations table, so the second identically-named migration is
// silently skipped — leaving report_annotation uncreated on a fresh DB.
// Every statement is IF NOT EXISTS, so re-running on an existing DB is a
// no-op. Same class of fix as commit 69c57550 (pos_session collision).
export class Migration20260509000001 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "report_annotation" (' +
        '"id" text not null, ' +
        '"date" text not null, ' +
        '"label" text not null, ' +
        '"description" text null, ' +
        '"color" text not null default \'slate\', ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "report_annotation_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create index if not exists "IDX_report_annotation_date" on "report_annotation" ("date") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_report_annotation_deleted_at" on "report_annotation" ("deleted_at") where "deleted_at" is not null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "report_annotation" cascade;')
  }
}
