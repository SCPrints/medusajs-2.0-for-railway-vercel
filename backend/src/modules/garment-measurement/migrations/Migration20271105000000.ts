import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20271105000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "garment_measurement" (' +
        '"id" text not null, ' +
        '"product_id" text not null, ' +
        '"garment_type" text not null, ' +
        '"size" text not null, ' +
        '"key" text not null, ' +
        '"value_cm" real not null, ' +
        '"estimated" boolean not null default false, ' +
        '"note" text null, ' +
        '"measured_by" text null, ' +
        '"measured_at" timestamptz not null, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "garment_measurement_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create index if not exists "IDX_garment_measurement_product_id" on "garment_measurement" ("product_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create unique index if not exists "IDX_garment_measurement_product_id_size_key_unique" on "garment_measurement" ("product_id", "size", "key") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_garment_measurement_deleted_at" on "garment_measurement" ("deleted_at") where "deleted_at" is not null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "garment_measurement" cascade;')
  }
}
