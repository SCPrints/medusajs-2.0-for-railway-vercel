import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /admin/reports/inventory-status
 *
 * Out-of-stock + low-stock variants among those we track stock for. "Low stock"
 * threshold is configurable via `?threshold=N` (default 10 units).
 *
 * These levels are the SUPPLIERS' warehouse stock, synced from their APIs, so
 * this answers "can we buy it?", not "what do we hold?".
 *
 * Raw SQL: the catalog has ~27k managed variants, far too many to walk through
 * the graph in one request. Available = stocked − reserved across all locations.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const logger = (req.scope as any).resolve?.("logger") ?? console

  const thresholdRaw = (req.query.threshold as string | undefined)?.trim()
  const lowStockThreshold = (() => {
    const n = Number(thresholdRaw)
    if (!Number.isFinite(n) || n < 0) return 10
    return Math.floor(n)
  })()

  try {
    const { rows } = await pg.raw(
      INVENTORY_SQL,
      { threshold: lowStockThreshold }
    )
    const shape = (r: any) => ({
      variant_id: r.id,
      sku: r.sku ?? null,
      title: r.title ?? "(no title)",
      product_title: r.product_title ?? "(unknown product)",
      product_id: r.product_id ?? null,
      in_stock: Number(r.in_stock),
    })
    const first = rows[0]
    return res.json({
      threshold: lowStockThreshold,
      summary: {
        total_managed_variants: Number(first?.total ?? 0),
        out_of_stock: Number(first?.out_total ?? 0),
        low_stock: Number(first?.low_total ?? 0),
      },
      out_of_stock: rows.filter((r: any) => r.bucket === "out").map(shape),
      low_stock: rows.filter((r: any) => r.bucket === "low").map(shape),
      data_available: true,
    })
  } catch (err: any) {
    logger.warn?.(`[inventory-status] query failed: ${err?.message ?? err}`)
    return res.json({
      threshold: lowStockThreshold,
      summary: {
        total_managed_variants: 0,
        out_of_stock: 0,
        low_stock: 0,
      },
      out_of_stock: [],
      low_stock: [],
      data_available: false,
      error: String(err?.message ?? err),
    })
  }
}

const INVENTORY_SQL = `
  WITH stock AS (
    SELECT v.id, v.title, v.sku, v.product_id, p.title AS product_title,
           COALESCE(SUM(l.stocked_quantity - l.reserved_quantity), 0) AS in_stock
    FROM product_variant v
    JOIN product p ON p.id = v.product_id AND p.deleted_at IS NULL
    LEFT JOIN product_variant_inventory_item link
      ON link.variant_id = v.id AND link.deleted_at IS NULL
    LEFT JOIN inventory_level l
      ON l.inventory_item_id = link.inventory_item_id AND l.deleted_at IS NULL
    WHERE v.manage_inventory = true AND v.deleted_at IS NULL
    GROUP BY v.id, p.title
  ),
  counted AS (
    SELECT *,
      COUNT(*) OVER () AS total,
      COUNT(*) FILTER (WHERE in_stock <= 0) OVER () AS out_total,
      COUNT(*) FILTER (WHERE in_stock > 0 AND in_stock < :threshold) OVER () AS low_total,
      CASE WHEN in_stock <= 0 THEN 'out' WHEN in_stock < :threshold THEN 'low' END AS bucket,
      ROW_NUMBER() OVER (
        PARTITION BY (in_stock <= 0), (in_stock < :threshold)
        ORDER BY in_stock
      ) AS row_in_bucket
    FROM stock
  )
  SELECT * FROM counted
  WHERE row_in_bucket <= 100
  ORDER BY in_stock
`
