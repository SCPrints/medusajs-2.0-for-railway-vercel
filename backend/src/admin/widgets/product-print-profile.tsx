import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { withWidgetBoundary } from "../components/widget-error-boundary"
import type { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types"
import { Badge, Button, Checkbox, Container, Heading, Label, Select, Text } from "@medusajs/ui"
import { Plus } from "@medusajs/icons"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  AreaRow,
  BLANK_AREA,
  METHOD_OPTIONS,
  SIDE_LABEL,
  areaSummary,
  toggle,
  type Area,
} from "../components/print-profile/area-editor"

const CUSTOM = "custom"
const NONE = "__none__"
const ALL_METHODS = ["print", "embroidery"]

/** Methods offered by at least one area of a profile (its natural capability). */
const unionMethods = (areas: Area[]): string[] =>
  ALL_METHODS.filter((m) => areas.some((a) => a.methods.includes(m)))

const setEq = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x))

/** Preview: intersect each area's methods with the product-level restriction. */
const filterAreasByMethods = (areas: Area[], allow: string[]): Area[] => {
  if (!allow.length || setEq(allow, ALL_METHODS)) return areas
  return areas
    .map((a) => ({ ...a, methods: a.methods.filter((m) => allow.includes(m)) }))
    .filter((a) => a.methods.length)
}

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
  methods: string[] | null
  screen_heavy?: boolean
  custom_areas: Area[]
  resolved_areas: Area[] | null
  profiles: ProfileOption[]
}

const ProductPrintProfileWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const productId = data?.id
  const [state, setState] = useState<LoadState | null>(null)
  const [selected, setSelected] = useState<string>(NONE)
  const [customAreas, setCustomAreas] = useState<Area[]>([])
  const [methods, setMethods] = useState<string[]>(ALL_METHODS)
  const [initialMethods, setInitialMethods] = useState<string[]>(ALL_METHODS)
  const [screenHeavy, setScreenHeavy] = useState(false)
  const [initialScreenHeavy, setInitialScreenHeavy] = useState(false)
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
      // Techniques: a saved restriction wins; otherwise default to the assigned
      // profile's full capability (so both boxes start ticked for a both-method
      // profile, only embroidery for an embroidery-only one, etc.).
      const profileAreas =
        !json.is_custom && json.profile_handle
          ? json.profiles.find((p) => p.handle === json.profile_handle)?.areas ?? []
          : []
      const initM = json.methods?.length ? json.methods : unionMethods(profileAreas)
      setMethods(initM.length ? initM : ALL_METHODS)
      setInitialMethods(initM.length ? initM : ALL_METHODS)
      setScreenHeavy(json.screen_heavy === true)
      setInitialScreenHeavy(json.screen_heavy === true)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    void load()
  }, [load])

  const isProfileMode = selected !== CUSTOM && selected !== NONE

  // The areas the customizer will use for the currently-selected option —
  // profile areas narrowed by the product-level technique restriction.
  const previewAreas = useMemo<Area[] | null>(() => {
    if (!state) return null
    if (selected === CUSTOM) return customAreas
    if (selected === NONE) return null
    const areas = state.profiles.find((p) => p.handle === selected)?.areas ?? null
    return areas ? filterAreasByMethods(areas, methods) : null
  }, [state, selected, customAreas, methods])

  const methodsChanged = isProfileMode && !setEq(methods, initialMethods)
  const screenHeavyChanged = screenHeavy !== initialScreenHeavy
  const dirty =
    selected !== initialSelected || selected === CUSTOM || methodsChanged || screenHeavyChanged

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
        if (!methods.length) {
          throw new Error("Pick at least one technique (Print and/or Embroidery).")
        }
        body.profile_handle = selected
        // Only send a restriction when it's narrower than the profile's natural
        // capability; otherwise clear it (defer to the profile defaults).
        const profileAreas =
          state?.profiles.find((p) => p.handle === selected)?.areas ?? []
        const union = unionMethods(profileAreas)
        body.methods = setEq(methods, union) ? null : methods
      }
      if (screenHeavyChanged) {
        body.screen_heavy = screenHeavy
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
          onValueChange={(v) => {
            setSelected(v)
            if (v !== NONE && v !== CUSTOM) {
              const prof = state?.profiles.find((p) => p.handle === v)
              setMethods(prof ? unionMethods(prof.areas) : ALL_METHODS)
            }
          }}
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
          <div className="flex flex-col gap-y-2">
            <div className="flex flex-col gap-y-1">
              <Label className="text-xs">Techniques (this garment)</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {METHOD_OPTIONS.map((m) => (
                  <label key={m.id} className="flex items-center gap-x-2 text-sm">
                    <Checkbox
                      checked={methods.includes(m.id)}
                      disabled={loading || saving}
                      onCheckedChange={() => setMethods((cur) => toggle(cur, m.id))}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
              <Text size="xsmall" className="text-ui-fg-muted">
                Applies to every location above. Leave both ticked to use the
                profile's defaults; untick one to restrict this garment (e.g.
                embroidery-only).
              </Text>
            </div>
            <Text size="xsmall" className="text-ui-fg-muted">
              {previewAreas
                ? `Allows: ${areaSummary(previewAreas)}.`
                : "This profile has no print locations."}
            </Text>
          </div>
        )}

        <div className="flex flex-col gap-y-1 border-t pt-3">
          <label className="flex items-center gap-x-2 text-sm">
            <Checkbox
              checked={screenHeavy}
              disabled={loading || saving}
              onCheckedChange={() => setScreenHeavy((v) => !v)}
            />
            Heavy garment — screen printing +$1.00/print
          </label>
          <Text size="xsmall" className="text-ui-fg-muted">
            Tick for hoodies, sweats, fleece and polyester garments. The
            supplier charges extra to screen print these; the customizer passes
            it through on screen-printed sides only (DTF is unaffected).
          </Text>
        </div>

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
