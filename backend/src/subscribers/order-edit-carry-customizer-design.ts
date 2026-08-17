import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { writeAudit } from "../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../lib/audit-entities"
import {
  planDesignCarryover,
  rekeyLineScopedMetadata,
  type CarryoverItem,
} from "../lib/order-edit-design-carryover"

type Pg = {
  raw(sql: string, bindings?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
}

/**
 * When staff replace a garment via Edit Order (remove old line + add a new
 * variant in one edit), the new line has no `metadata.customizerDesign` — so
 * the approval PDF, customizer downloads widget, approval page, and print
 * files all break for that line (bit us on order #44, 2026-08-17).
 *
 * On `order-edit.confirmed` this detects the unambiguous single-swap case and:
 *   1. copies `customizerDesign` to the new line — in BOTH `order_line_item`
 *      AND the versioned `order_item` detail row (Medusa reads item metadata
 *      from `order_item`; writing only the line-item table is not enough),
 *   2. re-keys `revised_proofs` / `mockup_print_dimensions` /
 *      `mockup_proof_notes` on order.metadata from the old line id to the new.
 *
 * Ambiguous edits (multiple removed/added designed lines) are logged and
 * skipped. Never rethrows — a carry-over failure must not break the edit
 * staff already confirmed. Idempotent: re-firing copies the same design and
 * finds nothing left to re-key.
 */
export default async function orderEditCarryCustomizerDesign({
  event: { data },
  container,
}: SubscriberArgs<{ order_id: string }>) {
  const orderId = data?.order_id
  if (!orderId) return

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Pg

    const versionRes = await pg.raw(`select version from "order" where id = ?`, [orderId])
    const version = Number(versionRes.rows[0]?.version)
    if (!Number.isFinite(version) || version < 2) return

    // NOTE: knex.raw treats `?` as a binding placeholder, so the jsonb
    // existence operator is written as jsonb_exists() throughout.
    const itemsRes = await pg.raw(
      `select oi.item_id, oi.version,
              (jsonb_exists(coalesce(oi.metadata,'{}'::jsonb), 'customizerDesign')
               or jsonb_exists(coalesce(oli.metadata,'{}'::jsonb), 'customizerDesign')) as has_design
       from order_item oi
       join order_line_item oli on oli.id = oi.item_id
       where oi.order_id = ? and oi.version in (?, ?) and oi.deleted_at is null`,
      [orderId, version - 1, version]
    )
    const byVersion = (v: number): CarryoverItem[] =>
      itemsRes.rows
        .filter((r) => Number(r.version) === v)
        .map((r) => ({ item_id: String(r.item_id), has_design: Boolean(r.has_design) }))

    const plan = planDesignCarryover(byVersion(version - 1), byVersion(version))
    if (!plan) return

    // Design source: the versioned detail row first (authoritative for reads),
    // line-item row as fallback.
    const designRes = await pg.raw(
      `select coalesce(
         (select metadata->'customizerDesign' from order_item
          where order_id = ? and item_id = ?
            and jsonb_exists(coalesce(metadata,'{}'::jsonb), 'customizerDesign') limit 1),
         (select metadata->'customizerDesign' from order_line_item where id = ?)
       ) as design`,
      [orderId, plan.from, plan.from]
    )
    const design = designRes.rows[0]?.design
    if (!design) return

    const designJson = JSON.stringify(design)
    await pg.raw(
      `update order_line_item
       set metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{customizerDesign}', ?::jsonb)
       where id = ?`,
      [designJson, plan.to]
    )
    await pg.raw(
      `update order_item
       set metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{customizerDesign}', ?::jsonb)
       where order_id = ? and item_id = ?`,
      [designJson, orderId, plan.to]
    )

    const metaRes = await pg.raw(`select metadata from "order" where id = ?`, [orderId])
    const rekeyed = rekeyLineScopedMetadata(
      metaRes.rows[0]?.metadata as Record<string, unknown> | null,
      plan.from,
      plan.to
    )
    for (const [key, value] of Object.entries(rekeyed)) {
      await pg.raw(
        `update "order" set metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), ?::text[], ?::jsonb) where id = ?`,
        [`{${key}}`, JSON.stringify(value), orderId]
      )
    }

    logger.info(
      `[order-edit-carryover] order=${orderId} copied customizerDesign ${plan.from} -> ${plan.to} (rekeyed: ${Object.keys(rekeyed).join(",") || "none"})`
    )

    await writeAudit({
      container,
      entity: AUDIT_ENTITY.ORDER,
      entity_id: orderId,
      action: AUDIT_ACTION.DESIGN_CARRIED_OVER,
      details: { from_line_item_id: plan.from, to_line_item_id: plan.to },
    })
  } catch (err) {
    logger.warn(
      `[order-edit-carryover] failed for order=${orderId}: ${(err as Error).message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order-edit.confirmed",
}
