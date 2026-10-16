import type { ArtworkStage, BlanksStage, DownstreamStage } from "./production-stage"

/**
 * Stages that mean "printing has started". Moving an order into one of these
 * from `received` runs the readiness check. Shipping a stock order straight
 * from `received` doesn't: there's nothing to print.
 */
const GATED_STAGES: ReadonlySet<DownstreamStage> = new Set(["in_production", "quality_check"])

/** A line the studio decorates (customizer or decoration design). */
export function isDecoratedLine(line: { metadata?: Record<string, unknown> | null }): boolean {
  const m = line.metadata ?? {}
  const isObject = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v)
  return isObject(m.customizerDesign) || isObject(m.decorationDesign) || m.pos_line_kind === "customizer"
}

/**
 * Pure: why an order isn't ready to start production, or [] when it is (or
 * when this move doesn't start production). Uses the stages the request is
 * moving TO, so staff can approve artwork, mark blanks arrived and start
 * production in one save.
 *
 * Staff can override with a reason. POS fast-forward and automation rules
 * don't go through this check.
 */
export function productionGateFailures(input: {
  meta: Record<string, unknown>
  fromDownstream: DownstreamStage
  toDownstream: DownstreamStage
  artwork: ArtworkStage
  blanks: BlanksStage
  hasDecoratedLines: boolean
}): string[] {
  if (input.fromDownstream !== "received" || !GATED_STAGES.has(input.toDownstream)) return []

  const failures: string[] = []
  if (input.hasDecoratedLines && input.artwork !== "approved") {
    failures.push("Artwork isn't approved")
  }
  if (input.hasDecoratedLines && input.blanks !== "arrived") {
    failures.push("Blanks haven't arrived")
  }
  const deposit = Number(input.meta.deposit_amount_cents ?? 0)
  if (deposit > 0 && input.meta.deposit_paid !== true) {
    failures.push("Deposit hasn't been paid")
  }
  return failures
}
