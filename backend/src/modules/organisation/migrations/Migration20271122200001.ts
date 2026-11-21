import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20271122200001 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "organisation_allowance_pick" (' +
        '"id" text not null, "allowance_id" text not null, "roster_member_id" text not null, "token" text not null, ' +
        '"picks" jsonb not null default \'[]\'::jsonb, "submitted_at" timestamptz null, ' +
        '"created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, ' +
        'constraint "organisation_allowance_pick_pkey" primary key ("id"));'
    )
    this.addSql(
      'create unique index if not exists "IDX_organisation_allowance_pick_token" on "organisation_allowance_pick" ("token") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_allowance_pick_allowance_id" on "organisation_allowance_pick" ("allowance_id") where "deleted_at" is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "organisation_allowance_pick" cascade;')
  }
}
