import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Colleague invitations (`organisation_invite`). */
export class Migration20271122100000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "organisation_invite" (' +
        '"id" text not null, ' +
        '"organisation_id" text not null, ' +
        '"email" text not null, ' +
        '"role" text check ("role" in (\'owner\', \'purchaser\', \'viewer\')) not null default \'purchaser\', ' +
        '"token_hash" text not null, ' +
        '"invited_by" text not null, ' +
        '"expires_at" timestamptz not null, ' +
        '"accepted_at" timestamptz null, ' +
        '"revoked_at" timestamptz null, ' +
        '"send_count" integer not null default 1, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "organisation_invite_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_invite_org_id" on "organisation_invite" ("organisation_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create unique index if not exists "IDX_organisation_invite_token_hash" on "organisation_invite" ("token_hash") where "deleted_at" is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "organisation_invite" cascade;')
  }
}
