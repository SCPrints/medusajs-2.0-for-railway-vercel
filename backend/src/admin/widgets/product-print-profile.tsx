import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { withWidgetBoundary } from "../components/widget-error-boundary"
import type { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Select, Text } from "@medusajs/ui"
import { Plus } from "@medusajs/icons"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  AreaRow,
  BLANK_AREA,
  SIDE_LABEL,
  areaSummary,
  type Area,
} from "../components/print-profile/area-editor"

const CUSTOM = "custom"
const NONE = "__none__"

type ProfileOption = {
  id: string
  name: string
  handle: string
  is_system: boolean
  areas: Area[]
}

type LoadState = {
  profile_handle: string | null
  is_custom: boolean
  custom_areas: Area[]
  resolved_areas: Area[] | null
  profiles: ProfileOption[]
}

const ProductPrintProfileWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const productId = data?.id
  const [state, setState] = useState<LoadState | null>(null)
  const [selected, setSelected] = useState<string>(NONE)
  const [customAreas, setCustomAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const initialSelected = state
    ? state.is_custom
      ? CUSTOM
      : state.profile_handle ?? NONE
    : NONE

  const load = useCallback(async () => {
    if (!productId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/admin/products/${productId}/print-profile`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as LoadState
      setState(json)
      setSelected(json.is_custom ? CUSTOM : json.profile_handle ?? NONE)
      setCustomAreas(
        (json.custom_areas?.length
          ? json.custom_areas
          : json.resolved_areas ?? []
        ).map((a) => ({ ...a, methods: [...a.methods], sizes: [...a.sizes] }))
      )
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    void load()
  }, [load])

  // The areas the customizer will use for the currently-selected option.
  const previewAreas = useMemo<Area[] | null>(() => {
    if (!state) return null
    if (selected === CUSTOM) return customAreas
    if (selected === NONE) return null
    return state.profiles.find((p) => p.handle === selected)?.areas ?? null
  }, [state, selected, customAreas])

  const dirty = selected !== initialSelected || selected === CUSTOM

  const save = async () => {
    if (!productId) return
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {}
      if (selected === CUSTOM) {
        for (const a of customAreas) {
          if (!a.methods.length || !a.sizes.length) {
            throw new Error(
              `${SIDE_LABEL[a.key] ?? a.key}: pick at least one technique and one size.`
            )
          }
        }
        body.areas = customAreas
      } else if (selected === NONE) {
        body.profile_handle = null
      } else {
        body.profile_handle = selected
      }
      const res = await fetch(`/admin/products/${productId}/print-profile`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.message ?? `HTTP ${res.status}`)
      }
      setSavedAt(Date.now())
      await load()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!productId) return null

  const addArea = () => setCustomAreas((a) => [...a, { ...BLANK_AREA }])
  const updateArea = (idx: number, next: Area) =>
    setCustomAreas((a) => a.map((x, i) => (i === idx ? next : x)))
  const removeArea = (idx: number) =>
    setCustomAreas((a) => a.filter((_, i) => i !== idx))

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Print profile</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Which locations this garment can be printed on, and the techniques +
          sizes allowed per location. The customizer enforces this.
        </Text>
      </div>
      <div className="px-6 py-4 flex flex-col gap-y-3">
        {error ? (
          <Text size="small" className="text-ui-tag-red-icon">
            {error}
          </Text>
        ) : null}

        <Select
          value={selected}
          onValueChange={setSelected}
          disabled={loading || saving}
        >
          <Select.Trigger>
            <Select.Value placeholder={loading ? "Loading…" : "Choose a profile"} />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value={NONE}>(Automatic — no profile)</Select.Item>
            {(state?.profiles ?? []).map((p) => (
              <Select.Item key={p.handle} value={p.handle}>
                {p.name}
              </Select.Item>
            ))}
            <Select.Item value={CUSTOM}>Custom (this product only)…</Select.Item>
          </Select.Content>
        </Select>

        {selected === CUSTOM ? (
          <div className="flex flex-col gap-y-2">
            <div className="flex items-center justify-between">
              <Text size="xsmall" className="text-ui-fg-muted">
                Custom locations for this product only.
              </Text>
              <Button size="small" variant="secondary" onClick={addArea}>
                <Plus className="mr-1" /> Add location
              </Button>
            </div>
            {customAreas.length === 0 ? (
              <Text size="xsmall" className="text-ui-fg-muted">
                No locations yet — add at least one.
              </Text>
            ) : (
              customAreas.map((area, idx) => (
                <AreaRow
                  key={idx}
                  area={area}
                  onChange={(a) => updateArea(idx, a)}
                  onRemove={() => removeArea(idx)}
                />
              ))
            )}
          </div>
        ) : selected === NONE ? (
          <Text size="xsmall" className="text-ui-fg-muted">
            No profile assigned — the customizer falls back to automatic rules
            inferred from the title/tags. Assign a profile for explicit control.
          </Text>
        ) : (
          <Text size="xsmall" className="text-ui-fg-muted">
            {previewAreas
              ? `Allows: ${areaSummary(previewAreas)}.`
              : "This profile has no print locations."}
          </Text>
        )}

        <div className="flex items-center justify-between">
          <Text size="xsmall" className="text-ui-fg-muted">
            {state?.is_custom ? (
              <Badge size="2xsmall" color="orange">
                custom
              </Badge>
            ) : state?.profile_handle ? (
              <>
                Current: <span className="font-medium">{state.profile_handle}</span>
              </>
            ) : (
              <>No profile assigned.</>
            )}
            {savedAt ? <span className="ml-2 text-ui-fg-subtle">· saved</span> : null}
          </Text>
          <Button size="small" onClick={save} disabled={!dirty || saving} isLoading={saving}>
            Save
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default withWidgetBoundary(ProductPrintProfileWidget, "product-print-profile")
