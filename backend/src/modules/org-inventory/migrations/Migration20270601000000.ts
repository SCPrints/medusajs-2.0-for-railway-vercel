import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Phase 1 of the customer fulfillment service — creates the
 * `org_inventory` + `org_inventory_movement` tables.
 *
 * Coupled in one migration because movements reference inventory rows
 * via foreign-key-style logical link.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → data model §§ 3-4.
 */
export class Migration20270601000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "org_inventory" (' +
        '"id" text not null, ' +
        '"organisation_id" text not null, ' +
        '"product_variant_id" text not null, ' +
        '"organisation_design_id" text not null, ' +
        '"fulfillment_mode" text not null default \'held_stock\', ' +
        '"unit_price" integer not null, ' +
        '"unit_cost" integer not null, ' +
        '"quantity_on_hand" integer not null default 0, ' +
        '"quantity_reserved" integer not null default 0, ' +
        '"reorder_point" integer null, ' +
        '"reorder_quantity" integer null, ' +
        '"lead_time_days" integer null, ' +
        '"customer_facing_label" text null, ' +
        '"is_active" boolean not null default true, ' +
        '"metadata" jsonb not null default \'{}\'::jsonb, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "org_inventory_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create index if not exists "IDX_org_inventory_org_id" ' +
        'on "org_inventory" ("organisation_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_org_inventory_variant_id" ' +
        'on "org_inventory" ("product_variant_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_org_inventory_design_id" ' +
        'on "org_inventory" ("organisation_design_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create unique index if not exists "IDX_org_inventory_org_variant_design" ' +
        'on "org_inventory" ("organisation_id", "product_variant_id", "organisation_design_id") ' +
        'where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_org_inventory_org_active" ' +
        'on "org_inventory" ("organisation_id", "is_active") where "deleted_at" is null;'
    )

    this.addSql(
      'create table if not exists "org_inventory_movement" (' +
        '"id" text not null, ' +
        '"org_inventory_id" text not null, ' +
        '"qty_delta" integer not null, ' +
        '"reason" text not null, ' +
        '"reference_type" text null, ' +
        '"reference_id" text null, ' +
        '"notes" text null, ' +
        '"created_by" text null, ' +
        '"metadata" jsonb not null default \'{}\'::jsonb, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "org_inventory_movement_pkey" primary key ("id")' +
        ');'
    )
    this.addSql(
      'create index if not exists "IDX_org_inventory_movement_inv_id" ' +
        'on "org_inventory_movement" ("org_inventory_id") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_org_inventory_movement_inv_created" ' +
        'on "org_inventory_movement" ("org_inventory_id", "created_at") where "deleted_at" is null;'
    )
    this.addSql(
      'create index if not exists "IDX_org_inventory_movement_reference" ' +
        'on "org_inventory_movement" ("reference_type", "reference_id") ' +
        'where "deleted_at" is null and "reference_type" is not null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "org_inventory_movement" cascade;')
    this.addSql('drop table if exists "org_inventory" cascade;')
  }
}
