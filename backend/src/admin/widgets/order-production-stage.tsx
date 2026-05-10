import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Input, Switch, Text, Textarea } from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  PRODUCTION_STAGES,
  PRODUCTION_STAGE_LABEL,
  STAGE_SLA_DAYS,
  STAGES_THAT_EMAIL,
  customerMilestoneForStage,
  isProductionStage,
  type ProductionStage,
  type ProductionStageHistoryEntry,
} from "../../lib/production-stage"

const adminPath = (orderId: string) => `/admin/orders/${orderId}/production-stage`
const dueDatePath = (orderId: string) => `/admin/orders/${orderId}/production-due-date`
const rushFlagPath = (orderId: string) => `/admin/orders/${orderId}/rush-flag`

type StatusPayload = {
  production_stage: ProductionStage | null
  production_stage_changed_at: string | null
  production_stage_history: ProductionStageHistoryEntry[]
  production_due_date?: string | null
}

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return "—"
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return "—"
  return new Date(ts).toLocaleString()
}

const formatShortDate = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })

const stageBadgeColor = (stage: ProductionStage | null): "grey" | "blue" | "orange" | "green" => {
  if (!stage) return "grey"
  if (stage === "delivered") return "green"
  if (stage === "shipped" || stage === "in_production") return "blue"
  if (stage === "awaiting_approval") return "orange"
  return "grey"
}

const OrderProductionStageWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const orderId = data?.id
  const meta = (data?.metadata ?? {}) as Record<string, unknown>

  const initialStage = useMemo<ProductionStage | null>(() => {
    const raw = meta.production_stage
    return isProductionStage(raw) ? raw : null
  }, [meta])

  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [pendingStage, setPendingStage] = useState<ProductionStage>(initialStage ?? "received")
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Due date editing
  const [dueDate, setDueDate] = useState<string>("")
  const [savingDue, setSavingDue] = useState(false)
  const [dueError, setDueError] = useState<string | null>(null)

  // Rush flag
  const [isRush, setIsRush] = useState<boolean>(Boolean(meta.is_rush))
  const [savingRush, setSavingRush] = useState(false)

  const load = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(adminPath(orderId), {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      const body = (await res.json().catch(() => ({}))) as StatusPayload & { message?: string }
      if (!res.ok) {
        throw new Error((body as any)?.message || `HTTP ${res.status}`)
      }
      setStatus(body)
      if (body.production_stage) {
        setPendingStage(body.production_stage)
      }
      if (body.production_due_date) {
        setDueDate(body.production_due_date.slice(0, 10))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load production stage")
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { void load() }, [load])

  const save = useCallback(async () => {
    if (!orderId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(adminPath(orderId), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ stage: pendingStage, note: note.trim() || undefined }),
      })
      const body = (await res.json().catch(() => ({}))) as StatusPayload & {
        message?: string
        ok?: boolean
        changed?: boolean
      }
      if (!res.ok) {
        throw new Error((body as any)?.message || `HTTP ${res.status}`)
      }
      setStatus({
        production_stage: body.production_stage,
        production_stage_changed_at: body.production_stage_changed_at,
        production_stage_history: body.production_stage_history ?? [],
      })
      setNote("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update production stage")
    } finally {
      setSaving(false)
    }
  }, [orderId, pendingStage, note])

  const saveDueDate = useCallback(async () => {
    if (!orderId) return
    setSavingDue(true)
    setDueError(null)
    try {
      const res = await fetch(dueDatePath(orderId), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_date: dueDate || null }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      setDueError(e instanceof Error ? e.message : "Failed to save due date")
    } finally {
      setSavingDue(false)
    }
  }, [orderId, dueDate])

  const toggleRush = useCallback(async (next: boolean) => {
    if (!orderId) return
    setIsRush(next)
    setSavingRush(true)
    try {
      await fetch(rushFlagPath(orderId), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_rush: next }),
      })
    } catch {
      setIsRush(!next) // rollback
    } finally {
      setSavingRush(false)
    }
  }, [orderId])

  const currentStage = status?.production_stage ?? initialStage
  const willEmail = STAGES_THAT_EMAIL.has(pendingStage) && pendingStage !== currentStage
  const noChange = currentStage === pendingStage

  // #10 — days at current stage + SLA status
  const stageChangedAt = status?.production_stage_changed_at
  const daysAtStage = useMemo(() => {
    if (!stageChangedAt) return null
    const t = Date.parse(stageChangedAt)
    if (!Number.isFinite(t)) return null
    return Math.floor((Date.now() - t) / 86_400_000)
  }, [stageChangedAt])

  const slaStatus = useMemo(() => {
    if (daysAtStage === null || !currentStage) return null
    const sla = STAGE_SLA_DAYS[currentStage]
    if (!sla) return null
    const overdue = daysAtStage > sla
    const approaching = !overdue && daysAtStage >= sla * 0.8
    return { sla, overdue, approaching, daysLeft: sla - daysAtStage }
  }, [daysAtStage, currentStage])

  // #11 — estimated completion date
  const estimatedCompletion = useMemo(() => {
    if (!stageChangedAt || !currentStage) return null
    const sla = STAGE_SLA_DAYS[currentStage]
    if (!sla) return null
    const t = Date.parse(stageChangedAt)
    if (!Number.isFinite(t)) return null
    return t + sla * 86_400_000
  }, [stageChangedAt, currentStage])

  if (!orderId) return null

  return (
    <Container className="divide-y p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex flex-col gap-y-0.5">
          <div className="flex items-center gap-x-2">
            <Heading level="h2">Production stage</Heading>
            {isRush ? (
              <Badge color="red" className="text-[10px] font-bold tracking-wide">
                RUSH
              </Badge>
            ) : null}
          </div>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Updates the customer-facing tracker and triggers an email on milestone transitions.
          </Text>
        </div>
        <div className="flex flex-col items-end gap-y-1">
          <Badge color={stageBadgeColor(currentStage)}>
            {currentStage ? PRODUCTION_STAGE_LABEL[currentStage] : "Not set"}
          </Badge>
          {/* #10 — days at stage */}
          {daysAtStage !== null && slaStatus ? (
            <Text
              size="xsmall"
              className={
                slaStatus.overdue
                  ? "text-ui-tag-red-icon font-medium"
                  : slaStatus.approaching
                    ? "text-ui-tag-orange-icon"
                    : "text-ui-fg-subtle"
              }
            >
              {daysAtStage}d at stage
              {slaStatus.overdue
                ? ` — ${Math.abs(slaStatus.daysLeft)}d overdue`
                : ` of ${slaStatus.sla}d SLA`}
            </Text>
          ) : daysAtStage !== null ? (
            <Text size="xsmall" className="text-ui-fg-subtle">
              {daysAtStage}d at stage
            </Text>
          ) : null}
          {/* #11 — estimated completion */}
          {estimatedCompletion !== null ? (
            <Text size="xsmall" className="text-ui-fg-subtle">
              Est. complete: {formatShortDate(estimatedCompletion)}
            </Text>
          ) : null}
        </div>
      </div>

      {/* Stage update form */}
      <div className="px-6 py-4 flex flex-col gap-y-4">
        {error ? (
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        ) : null}

        <label className="flex flex-col gap-y-1">
          <Text size="small" weight="plus">
            Set stage
          </Text>
          <select
            value={pendingStage}
            onChange={(e) => setPendingStage(e.target.value as ProductionStage)}
            disabled={saving || loading}
            className="bg-ui-bg-base border border-ui-border-base rounded-md px-3 py-2 text-ui-fg-base text-small focus:outline-none focus:ring-2 focus:ring-ui-fg-interactive disabled:opacity-60"
          >
            {PRODUCTION_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {PRODUCTION_STAGE_LABEL[stage]}
                {STAGES_THAT_EMAIL.has(stage) ? " — emails customer" : ""}
              </option>
            ))}
          </select>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Customer milestone:{" "}
            <span className="text-ui-fg-base">{customerMilestoneForStage(pendingStage)}</span>
          </Text>
        </label>

        <label className="flex flex-col gap-y-1">
          <Text size="small" weight="plus">
            Note (optional, internal)
          </Text>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Visible in stage history. Not sent to customer."
            rows={2}
            disabled={saving}
          />
        </label>

        <div className="flex items-center justify-between">
          <Text size="xsmall" className="text-ui-fg-subtle">
            {willEmail ? (
              <span className="text-ui-fg-interactive">An email will be sent on save.</span>
            ) : noChange ? (
              "No change to apply."
            ) : (
              "No customer email for this transition."
            )}
          </Text>
          <Button onClick={save} disabled={saving || noChange}>
            {saving ? "Saving…" : "Update stage"}
          </Button>
        </div>
      </div>

      {/* Rush flag toggle */}
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex flex-col gap-y-0.5">
          <Text size="small" weight="plus">
            Rush order
          </Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Shows a red RUSH badge on the production board. Internal only.
          </Text>
        </div>
        <Switch
          checked={isRush}
          onCheckedChange={toggleRush}
          disabled={savingRush}
          id="rush-toggle"
        />
      </div>

      {/* Production due date */}
      <div className="px-6 py-4 flex flex-col gap-y-2">
        <Text size="small" weight="plus">
          Production due date
        </Text>
        <div className="flex items-center gap-x-2">
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={savingDue}
            className="w-44"
          />
          <Button
            size="small"
            variant="secondary"
            onClick={saveDueDate}
            disabled={savingDue}
          >
            {savingDue ? "Saving…" : "Save"}
          </Button>
          {dueDate ? (
            <Button
              size="small"
              variant="transparent"
              onClick={async () => {
                if (!orderId) return
                setDueDate("")
                setSavingDue(true)
                setDueError(null)
                try {
                  const res = await fetch(dueDatePath(orderId), {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ due_date: null }),
                  })
                  if (!res.ok) throw new Error(`HTTP ${res.status}`)
                } catch (e) {
                  setDueError(e instanceof Error ? e.message : "Failed to clear due date")
                } finally {
                  setSavingDue(false)
                }
              }}
              disabled={savingDue}
            >
              Clear
            </Button>
          ) : null}
        </div>
        {dueError ? (
          <Text size="xsmall" className="text-ui-fg-error">{dueError}</Text>
        ) : null}
        <Text size="xsmall" className="text-ui-fg-subtle">
          Sets the target completion date. Also draggable on the Production calendar view.
        </Text>
      </div>

      {/* History */}
      <div className="px-6 py-4">
        <Text size="small" weight="plus" className="mb-2">
          History
        </Text>
        {status?.production_stage_history?.length ? (
          <ul className="list-none p-0 m-0 flex flex-col gap-y-2">
            {[...status.production_stage_history].reverse().map((entry, idx) => (
              <li
                key={`${entry.changed_at}-${idx}`}
                className="rounded-md bg-ui-bg-subtle px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-x-3">
                  <Text size="small" weight="plus">
                    {PRODUCTION_STAGE_LABEL[entry.stage]}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {formatDate(entry.changed_at)}
                  </Text>
                </div>
                {entry.changed_by ? (
                  <Text size="xsmall" className="text-ui-fg-muted mt-0.5">
                    by {entry.changed_by}
                  </Text>
                ) : null}
                {entry.note ? (
                  <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                    {entry.note}
                  </Text>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            No stage changes recorded yet.
          </Text>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderProductionStageWidget
