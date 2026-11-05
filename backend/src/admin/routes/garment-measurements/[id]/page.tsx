import { Badge, Button, Container, Heading, Select, Text } from "@medusajs/ui"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router-dom"

import { GarmentPicture } from "../../../components/garment-measurements/garment-picture"
import { STATUS } from "../../../components/garment-measurements/status"
import { AppLink } from "../../../lib/nav"
import {
  GARMENTS,
  GARMENT_TYPES,
  checkMeasurement,
  type GarmentType,
  type SizeStatus,
} from "../../../../lib/garment-measurements"

/**
 * /app/garment-measurements/:productId — staff record each size's flat
 * measurements for the 3D builder, one measurement per screen. Internal only.
 * Opened from the "3D measurements" card on the product page.
 */

type Row = {
  size: string
  key: string
  value_cm: number
  estimated: boolean
  note: string | null
  measured_by: string | null
  measured_at: string
}
type Data = {
  product: { id: string; title: string; handle: string }
  sizes: string[]
  garment_type: GarmentType
  has_rows: boolean
  status: Record<string, SizeStatus>
  rows: Row[]
}

const GarmentMeasurementsPage = () => {
  const productId = useParams().id ?? ""
  const [data, setData] = useState<Data | null>(null)
  const [type, setType] = useState<GarmentType>("tee")
  const [error, setError] = useState<string | null>(null)
  const [flow, setFlow] = useState<{ size: string; extras: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/admin/garment-measurements/${productId}`, { credentials: "include" })
      if (!res.ok) throw new Error(`Couldn't load (HTTP ${res.status})`)
      const json = (await res.json()) as Data
      setData(json)
      setType(json.garment_type)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [productId])
  useEffect(() => {
    load()
  }, [load])

  if (error) return <Container><Text className="text-ui-fg-error">{error}</Text></Container>
  if (!data) return <Container><Text>Loading…</Text></Container>

  if (flow)
    return (
      <MeasureFlow
        key={`${flow.size}|${flow.extras}`}
        data={data}
        type={type}
        size={flow.size}
        extras={flow.extras}
        onSaved={load}
        onClose={() => setFlow(null)}
        onNext={(size, extras) => setFlow({ size, extras })}
      />
    )

  const required = GARMENTS[type].steps.filter((s) => !s.optional)
  return (
    <Container className="flex flex-col gap-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h1">3D measurements</Heading>
          <Text className="text-ui-fg-subtle">
            <AppLink href={`/app/products/${data.product.id}`} className="text-ui-fg-interactive hover:underline">
              {data.product.title}
            </AppLink>{" "}
            · internal, for the 3D garment builder
          </Text>
        </div>
        <a
          href={`/admin/garment-measurements/${productId}/export`}
          target="_blank"
          rel="noreferrer"
          className="text-ui-fg-interactive text-sm hover:underline"
        >
          Export for 3D (JSON)
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Text weight="plus">Garment type</Text>
        <div className="w-64">
          <Select value={type} onValueChange={(v) => setType(v as GarmentType)} disabled={data.has_rows}>
            <Select.Trigger><Select.Value /></Select.Trigger>
            <Select.Content>
              {GARMENT_TYPES.map((t) => <Select.Item key={t} value={t}>{GARMENTS[t].label}</Select.Item>)}
            </Select.Content>
          </Select>
        </div>
        <Text size="small" className="text-ui-fg-muted">
          {data.has_rows ? "Set by the measurements already recorded." : "Pick this before you start."}
        </Text>
      </div>

      <div>
        <Text weight="plus" className="mb-2">Pick a size to measure</Text>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.sizes.map((size) => {
            const st = STATUS[data.status[size] ?? "todo"]
            const mine = data.rows.filter((r) => r.size === size)
            const measured = required.filter((s) => mine.some((r) => r.key === s.key && !r.estimated)).length
            const guessed = required.filter((s) => mine.some((r) => r.key === s.key && r.estimated)).length
            return (
              <button
                key={size}
                type="button"
                onClick={() => setFlow({ size, extras: false })}
                className="border-ui-border-base hover:bg-ui-bg-base-hover flex min-h-24 flex-col items-start gap-2 rounded-lg border p-3 text-left"
              >
                <span className="text-2xl font-semibold">{size}</span>
                <Badge size="2xsmall" color={st.color}>{st.label}</Badge>
                <Text size="small" className="text-ui-fg-muted">
                  {measured} of {required.length} measured{guessed ? `, ${guessed} estimated` : ""}
                </Text>
              </button>
            )
          })}
        </div>
      </div>
      <Text size="small" className="text-ui-fg-muted">
        Estimated = filled in from the other sizes, not taped. Measure it to replace the guess.
      </Text>
    </Container>
  )
}

function MeasureFlow(props: {
  data: Data
  type: GarmentType
  size: string
  extras: boolean
  onSaved: () => Promise<void>
  onClose: () => void
  onNext: (size: string, extras: boolean) => void
}) {
  const { data, type, size, extras, onSaved, onClose, onNext } = props
  const steps = useMemo(() => GARMENTS[type].steps.filter((s) => !!s.optional === extras), [type, extras])
  const hasExtras = GARMENTS[type].steps.some((s) => s.optional)
  const savedValue = (n: number) => {
    const r = steps[n] && data.rows.find((x) => x.size === size && x.key === steps[n].key)
    return r && !r.estimated ? String(r.value_cm) : ""
  }
  const [i, setI] = useState(0)
  const [value, setValue] = useState(() => savedValue(0))
  const [warning, setWarning] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const step = steps[i]
  const done = i >= steps.length
  const existing = step && data.rows.find((r) => r.size === size && r.key === step.key)

  // Each new step: focus the box and select any saved value, so typing replaces it.
  useLayoutEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [i])

  const go = (n: number) => {
    const to = Math.max(0, Math.min(steps.length, n))
    setI(to)
    setValue(savedValue(to))
    setWarning(null)
    setError(null)
  }

  const next = async (confirmed = false) => {
    const raw = value.trim().replace(",", ".")
    if (!raw) return go(i + 1) // skip for now
    const num = Number(raw)
    const unchanged = existing && !existing.estimated && existing.value_cm === num
    if (unchanged) return go(i + 1) // already saved; don't re-ask
    if (!confirmed) {
      const bySize = Object.fromEntries(
        data.rows.filter((r) => r.key === step.key && r.size !== size).map((r) => [r.size, r.value_cm])
      )
      const w = checkMeasurement({ step, value: num, size, sizes: data.sizes, bySize })
      if (w) return setWarning(w)
    }
    setSaving(true)
    try {
      const res = await fetch(`/admin/garment-measurements/${data.product.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ garment_type: type, size, key: step.key, value_cm: num }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`)
      await onSaved()
    } catch (e) {
      setSaving(false)
      return setError(`Didn't save: ${(e as Error).message}`)
    }
    setSaving(false)
    go(i + 1)
  }

  const sizeIdx = data.sizes.indexOf(size)
  const nextSize = data.sizes[sizeIdx + 1]
  const pct = Math.round((Math.min(i + 1, steps.length) / steps.length) * 100)

  return (
    <Container className="mx-auto flex w-full max-w-xl flex-col gap-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Heading level="h1">Size {size}{extras ? " extras" : ""}</Heading>
          <Text size="small" className="text-ui-fg-subtle">{data.product.title}</Text>
        </div>
        <Button variant="secondary" size="small" onClick={onClose}>All sizes</Button>
      </div>

      <div>
        <div className="mb-1 flex justify-between">
          <Text size="small" className="text-ui-fg-subtle">
            {done ? "All steps done" : `Step ${i + 1} of ${steps.length}`}
          </Text>
          {!done && <Text size="small" className="text-ui-fg-subtle">{step.group}</Text>}
        </div>
        <div className="bg-ui-bg-subtle h-2 overflow-hidden rounded-full">
          <div className="h-full rounded-full transition-all" style={{ width: `${done ? 100 : pct}%`, background: "#e5007e" }} />
        </div>
      </div>

      {done ? (
        <div className="flex flex-col gap-y-3 py-6 text-center">
          <Heading level="h2">Size {size} {extras ? "extras " : ""}done</Heading>
          <Text className="text-ui-fg-subtle">Saved as you went. Steps left blank can be done later.</Text>
          {!extras && hasExtras && (
            <Button size="large" variant="secondary" onClick={() => onNext(size, true)}>
              Measure the extras (pocket, hood edge)
            </Button>
          )}
          {nextSize && (
            <Button size="large" onClick={() => onNext(nextSize, false)}>Next size: {nextSize}</Button>
          )}
          <Button size="large" variant="secondary" onClick={onClose}>Back to sizes</Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!saving) next()
          }}
        >
          <GarmentPicture type={type} step={step.key} className="mx-auto h-auto max-h-[30vh] w-full" />
          <div>
            <Heading level="h2" className="text-2xl">{step.name}</Heading>
            <Text className="mt-1 text-base">{step.how}</Text>
            <Text size="small" className="text-ui-fg-muted mt-1">
              Lay it flat on the table, smooth it out, don't stretch it. Centimetres.
            </Text>
          </div>

          <label className="flex items-center gap-3">
            <input
              ref={input}
              value={value}
              onChange={(e) => { setValue(e.target.value); setWarning(null) }}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0"
              aria-label={`${step.name} in cm`}
              className="border-ui-border-base bg-ui-bg-field w-40 rounded-lg border px-4 py-3 text-4xl font-semibold tabular-nums"
            />
            <span className="text-2xl text-ui-fg-subtle">cm</span>
          </label>
          {existing && (
            <Text size="small" className="text-ui-fg-muted">
              {existing.estimated
                ? `Estimated so far: ${existing.value_cm} cm. Measure it to replace the guess.`
                : `Saved ${existing.value_cm} cm${existing.measured_by ? ` by ${existing.measured_by}` : ""}, ${new Date(existing.measured_at).toLocaleDateString("en-AU")}.`}
            </Text>
          )}

          {error && <Text className="text-ui-fg-error">{error}</Text>}

          <div
            className="bg-ui-bg-base sticky bottom-0 pt-2"
            style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
          >
            {warning && (
              <div className="bg-ui-tag-orange-bg border-ui-tag-orange-border text-ui-tag-orange-text rounded-lg border p-3">
                <Text weight="plus">Are you sure?</Text>
                <Text>{warning}</Text>
                <div className="mt-2 flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => { setWarning(null); input.current?.focus() }}>
                    Change it
                  </Button>
                  <Button type="button" onClick={() => next(true)} isLoading={saving}>Yes, it's right</Button>
                </div>
              </div>
            )}
            {!warning && (
            <div className="flex gap-3">
              <Button type="button" size="large" variant="secondary" className="min-h-12 flex-1" disabled={i === 0} onClick={() => go(i - 1)}>
                Back
              </Button>
              <Button type="submit" size="large" className="min-h-12 flex-[2]" isLoading={saving}>
                {value.trim() ? "Next" : "Skip for now"}
              </Button>
            </div>
            )}
          </div>
        </form>
      )}
    </Container>
  )
}

export default GarmentMeasurementsPage
