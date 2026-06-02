import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20270615000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "home_section" (' +
        '"id" text not null, ' +
        '"handle" text not null, ' +
        '"title" text not null, ' +
        '"subtitle" text null, ' +
        '"product_handles" jsonb not null default \'{}\'::jsonb, ' +
        '"is_published" boolean not null default true, ' +
        '"weight" integer not null default 0, ' +
        '"created_by" text null, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "home_section_pkey" primary key ("id")' +
        ");"
    )
    this.addSql(
      'create unique index if not exists "IDX_home_section_handle_unique" on "home_section" ("handle") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_home_section_is_published" on "home_section" ("is_published") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_home_section_weight" on "home_section" ("weight") where "deleted_at" is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "home_section" cascade;')
  }
}
