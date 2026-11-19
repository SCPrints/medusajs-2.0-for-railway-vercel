import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261119100000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "customer_artwork" (' +
        '"id" text not null, ' +
        '"customer_id" text not null, ' +
        '"organisation_id" text null, ' +
        '"name" text not null, ' +
        '"url" text not null, ' +
        '"mime_type" text not null, ' +
        '"thumbnail_url" text null, ' +
        '"source" text check ("source" in (\'upload\', \'order\')) not null default \'upload\', ' +
        '"source_order_id" text null, ' +
        '"hidden_at" timestamptz null, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "customer_artwork_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create index if not exists "IDX_customer_artwork_customer_id" on "customer_artwork" ("customer_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_customer_artwork_organisation_id" on "customer_artwork" ("organisation_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create unique index if not exists "IDX_customer_artwork_customer_id_url_unique" on "customer_artwork" ("customer_id", "url") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_customer_artwork_deleted_at" on "customer_artwork" ("deleted_at") where "deleted_at" is not null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "customer_artwork" cascade;')
  }
}
