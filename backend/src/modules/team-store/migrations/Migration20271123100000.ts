import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20271123100000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "team_store" (' +
        '"id" text not null, ' +
        '"organisation_id" text not null, ' +
        '"handle" text not null, ' +
        '"title" text not null, ' +
        '"intro" text null, ' +
        '"banner_url" text null, ' +
        '"accent_colour" text null, ' +
        '"status" text check ("status" in (\'draft\', \'awaiting_approval\', \'open\', \'closed\', \'in_production\', \'completed\', \'cancelled\')) not null default \'draft\', ' +
        '"opens_at" timestamptz null, ' +
        '"closes_at" timestamptz not null, ' +
        '"password_hash" text null, ' +
        '"delivery_mode" text check ("delivery_mode" in (\'bulk\', \'individual\')) not null default \'bulk\', ' +
        '"delivery_destination_id" text null, ' +
        '"expected_quantity" integer not null default 0, ' +
        '"minimum_quantity" integer null, ' +
        '"approved_at" timestamptz null, ' +
        '"approved_by_name" text null, ' +
        '"quote_id" text null, ' +
        '"metadata" jsonb not null default \'{}\', ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "team_store_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create unique index if not exists "IDX_team_store_handle_unique" on "team_store" ("handle") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_team_store_organisation_id" on "team_store" ("organisation_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_team_store_status" on "team_store" ("status") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_team_store_deleted_at" on "team_store" ("deleted_at") where "deleted_at" is not null;'
    )

    this.addSql(
      'create table if not exists "team_store_item" (' +
        '"id" text not null, ' +
        '"team_store_id" text not null, ' +
        '"product_handle" text not null, ' +
        '"colour" text not null, ' +
        '"allowed_sizes" jsonb null, ' +
        '"customizer_design" jsonb null, ' +
        '"print_size_ids" jsonb null, ' +
        '"unit_price" numeric null, ' +
        '"raw_unit_price" jsonb null, ' +
        '"unit_cost_estimate" numeric null, ' +
        '"raw_unit_cost_estimate" jsonb null, ' +
        '"weight" integer not null default 0, ' +
        '"is_active" boolean not null default true, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "team_store_item_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create index if not exists "IDX_team_store_item_team_store_id" on "team_store_item" ("team_store_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_team_store_item_deleted_at" on "team_store_item" ("deleted_at") where "deleted_at" is not null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "team_store_item" cascade;')
    this.addSql('drop table if exists "team_store" cascade;')
  }
}
