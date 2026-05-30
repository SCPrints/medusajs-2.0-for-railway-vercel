import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20270602000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "print_profile" (' +
        '"id" text not null, ' +
        '"name" text not null, ' +
        '"handle" text not null, ' +
        '"description" text null, ' +
        '"is_system" boolean not null default false, ' +
        '"position" integer not null default 0, ' +
        '"areas" jsonb not null default \'[]\', ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "print_profile_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create unique index if not exists "IDX_print_profile_handle" on "print_profile" ("handle") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_print_profile_deleted_at" on "print_profile" ("deleted_at") where "deleted_at" is not null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "print_profile" cascade;')
  }
}
