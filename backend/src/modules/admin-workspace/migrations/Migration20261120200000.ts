import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Supplier documents (customer portal extras, batch 1 B #22). */
export class Migration20261120200000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "supplier_document" (' +
        '"id" text not null, ' +
        '"title" text not null, ' +
        '"url" text not null, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "supplier_document_pkey" primary key ("id")' +
        ");"
    )
    this.addSql(
      'create index if not exists "IDX_supplier_document_deleted_at" on "supplier_document" ("deleted_at") where "deleted_at" is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "supplier_document" cascade;')
  }
}
