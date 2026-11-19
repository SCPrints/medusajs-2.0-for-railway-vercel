import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Buying on account (Docs/CUSTOMER_PORTAL_EXTRAS_2026_11.md § A): account
 * terms + AP contact on the organisation, spending limits on members, and
 * the purchase-order / cost-centre / parked-cart tables. Every bigNumber
 * column has its `raw_` jsonb twin (MikroORM selects it on every read).
 */
export class Migration20261120100000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table if exists "organisation" ' +
        'add column if not exists "account_terms_enabled" boolean not null default false, ' +
        'add column if not exists "account_terms_days" integer not null default 30, ' +
        'add column if not exists "credit_limit" numeric null, ' +
        'add column if not exists "raw_credit_limit" jsonb null, ' +
        'add column if not exists "ap_email" text null;'
    )
    this.addSql(
      'alter table if exists "organisation_member" ' +
        'add column if not exists "order_limit" numeric null, ' +
        'add column if not exists "raw_order_limit" jsonb null, ' +
        'add column if not exists "monthly_limit" numeric null, ' +
        'add column if not exists "raw_monthly_limit" jsonb null;'
    )

    this.addSql(
      'create table if not exists "organisation_purchase_order" (' +
        '"id" text not null, ' +
        '"organisation_id" text not null, ' +
        '"number" text not null, ' +
        '"amount" numeric not null, ' +
        '"raw_amount" jsonb not null, ' +
        '"expires_at" timestamptz null, ' +
        '"is_active" boolean not null default true, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "organisation_purchase_order_pkey" primary key ("id"));'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_purchase_order_organisation_id" ' +
        'on "organisation_purchase_order" ("organisation_id") where "deleted_at" is null;'
    )

    this.addSql(
      'create table if not exists "organisation_cost_centre" (' +
        '"id" text not null, ' +
        '"organisation_id" text not null, ' +
        '"code" text not null, ' +
        '"name" text not null, ' +
        '"is_active" boolean not null default true, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "organisation_cost_centre_pkey" primary key ("id"));'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_cost_centre_organisation_id" ' +
        'on "organisation_cost_centre" ("organisation_id") where "deleted_at" is null;'
    )

    this.addSql(
      'create table if not exists "organisation_cart" (' +
        '"id" text not null, ' +
        '"organisation_id" text not null, ' +
        '"cart_id" text not null, ' +
        '"name" text not null, ' +
        '"created_by" text not null, ' +
        "\"status\" text check (\"status\" in ('draft', 'awaiting_approval', 'approved', 'declined', 'ordered')) not null default 'draft', " +
        '"cost_centre" text null, ' +
        '"note" text null, ' +
        '"decided_by" text null, ' +
        '"decided_at" timestamptz null, ' +
        '"decline_reason" text null, ' +
        '"approved_total" numeric null, ' +
        '"raw_approved_total" jsonb null, ' +
        '"order_id" text null, ' +
        '"created_at" timestamptz not null default now(), ' +
        '"updated_at" timestamptz not null default now(), ' +
        '"deleted_at" timestamptz null, ' +
        'constraint "organisation_cart_pkey" primary key ("id"));'
    )
    this.addSql(
      'create index if not exists "IDX_organisation_cart_organisation_id_status" ' +
        'on "organisation_cart" ("organisation_id", "status") where "deleted_at" is null;'
    )
    this.addSql(
      'create unique index if not exists "IDX_organisation_cart_cart_id_unique" ' +
        'on "organisation_cart" ("cart_id") where "deleted_at" is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "organisation_cart" cascade;')
    this.addSql('drop table if exists "organisation_cost_centre" cascade;')
    this.addSql('drop table if exists "organisation_purchase_order" cascade;')
    this.addSql(
      'alter table if exists "organisation_member" ' +
        'drop column if exists "order_limit", drop column if exists "raw_order_limit", ' +
        'drop column if exists "monthly_limit", drop column if exists "raw_monthly_limit";'
    )
    this.addSql(
      'alter table if exists "organisation" ' +
        'drop column if exists "account_terms_enabled", drop column if exists "account_terms_days", ' +
        'drop column if exists "credit_limit", drop column if exists "raw_credit_limit", ' +
        'drop column if exists "ap_email";'
    )
  }
}
