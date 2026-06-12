"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CURATED_PRESETS,
  appendUserPreset,
  applyPreset,
  deleteUserPreset,
  loadUserPresets,
  type Preset,
} from "./presets"

export type ThreeTuning = {
  particleCount: number
  /** World-space radius of cursor influence disk. */
  cursorRadius: number
  /** Dead-zone radius around cursor centre (world units). Particles whose
   * carry target would land closer than this are pushed back to this
   * distance, keeping a clean void under the cursor tip. */
  cursorDisplacement: number
  /** How strongly particles are pulled toward the cursor when inside the
   * disk (0 = no pull, 1 = target snaps to cursor). The inBlend lag then
   * creates the natural comet-tail: particles can't keep up with a fast
   * cursor and trail behind it. Higher = deeper carry, bigger tail. */
  carryStrength: number
  /** @deprecated retained for back-compat in stored payloads. */
  trailDisplacement: number
  /** @deprecated retained for back-compat in stored payloads. */
  trailSpeedCap: number
  /** Position-blend rate toward target when in cursor disk.
   * alpha = inBlend × dt. At 60fps (dt≈0.016): inBlend=8 → alpha≈0.13
   * → particle chases cursor but lags behind at speed, creating the tail. */
  inBlend: number
  /** Position-blend rate toward home when outside disk.
   * alpha = outBlend × dt. At 60fps: outBlend=0.5 → alpha≈0.008 →
   * particle takes ~2–3 s to drift home = long visible comet tail.
   * Lower = longer tail. */
  outBlend: number
  pointSize: number
  /** Fraction of particles that enter the wake-playback state when they
   * exit the cursor disk. The rest simply lerp home. 0 = no trail. */
  trailingProbability: number
  /** How long (ms) each released particle traces the cursor path before
   * its wake ends and it springs home. */
  trailFollowMs: number
  /** Playback speed of the cursor-history playhead. < 1 = particle lags
   * behind cursor (longer trail), > 1 = catches up. */
  wakePace: number
  /** ± fraction of per-particle pace jitter — spreads particles along the
   * path so the trail reads as a band rather than a single bead. */
  wakePaceJitter: number
  /** Max per-particle backward time-offset (ms). Biased toward the front
   * of the wake so most particles hug the cursor with a thinning tail. */
  wakeTimeOffsetMs: number
  /** Signed along-tangent offset amplitude (world units). Spreads
   * particles along the cursor heading axis (lengthwise). */
  wakeAlongStretchBmp: number
  /** Perpendicular band offset amplitude (world units). Lateral spread
   * forming the ribbon's width. */
  wakeBandSpreadBmp: number
  /** Per-particle release stagger (ms). Particles hold their release
   * position until their stagger expires — staggers playback start. */
  wakeReleaseStaggerMs: number
  /** When true, the canvas overlays a cursor-history polyline and tints
   * particles in the trailing-playback state magenta. Diagnostic only. */
  debugOverlay: boolean
  /** World units behind the cursor along −motion. In-disk targets sit here
   * so captured particles read as dragged in the wake, not piled on the tip. */
  carryLagBehind: number
  /** Tangential push on the counter-rotating side of the motion vector. */
  sideSwirlForce: number
  /** Outward push on the front (leading) side of the disk. */
  frontPush: number
  /** Inward pinch on the rear side of the disk. */
  backInward: number
  /** Cursor speed (px/frame) below which swirl forces fade out. */
  motionGateSpeed: number
  /** `((R - dist) / R) ^ power` falloff for swirl/carry. */
  falloffPower: number
  /** Slow billow frequency (Hz) of the wake band's perpendicular offset.
   * 0 = fixed side per particle (straight comb ribbon); >0 = particles
   * oscillate across the path so the wake curls into tongues, matching
   * the newmixcoffee.com reference's billowing trail. */
  wakeCurlHz: number
  /** After a particle's wake playback ends it meanders home for this many
   * ms instead of beelining — the reference's slow diffusive recovery.
   * 0 disables the settle phase entirely. */
  settleMs: number
  /** Wobble amplitude (world units) during the settle meander. Decays
   * linearly to 0 over `settleMs`. */
  settleWobbleAmp: number
  /** FIELD MODE — the actual newmix mechanism. The cursor deposits
   * velocity into a coarse Stam-style fluid grid (advection + pressure
   * projection), and particles ride the FLUID instead of replaying cursor
   * history. Replaces wake playback + settle while on. */
  fieldMode: boolean
  /** Deposit strength multiplier for each stroke splat. */
  fieldStrength: number
  /** Deposit splat radius (world px) — 1/r donut falloff. */
  fieldRadius: number
  /** Semi-Lagrangian self-advection strength (0..1) — energy travels in
   * its own direction, forming the directional crescent wake. */
  fieldAdvection: number
  /** Lateral diffusion per frame (0..0.25) — energy seeps outward. */
  fieldDiffusion: number
  /** Pressure-projection strength (0..1) — removes divergence so vortices
   * curl and persist instead of smearing radially. */
  fieldProjection: number
  /** Fraction of field energy removed per second of inactivity. */
  fieldDecay: number
  /** How strongly particles couple to the sampled field velocity. */
  fieldRide: number
  /** Local field magnitude (L1, world px/frame) above which a particle is
   * "energized" — its home spring is suppressed so it rides the fluid.
   * THE locality knob: low values let weak advected energy capture the
   * whole wordmark (chain-reaction smear); high values confine motion to
   * the hot corridor near the stroke, like the reference. */
  fieldActivation: number
  /** Hard cap on per-cell fluid speed (world px/frame). Bounds the total
   * energy a stroke can carry regardless of deposit stacking. */
  fieldCellCap: number
  /** Home spring constant (per frame at 60fps) when the local fluid is
   * quiet. Higher = firmer, faster return. */
  homeSpring: number
  /** Multiplier on `homeSpring` while energized (0..1, small = the fluid
   * owns the particle until the field dies down). */
  energizedSpringScale: number
  /** Per-frame velocity damping in field mode (0..1, lower = heavier). */
  fieldFriction: number
}

/**
 * Defaults tuned 2026-06-12 against frame-by-frame captures of
 * newmixcoffee.com responding to a scripted cursor flick (see the
 * three-way GIF comparison in that session). The three gaps the pass
 * targets: broader material grab (radius up, void down), a curling wake
 * band instead of a straight comb (wakeCurlHz), and slow diffusive
 * recovery after the wake ends (settleMs/settleWobbleAmp). The previous
 * defaults are preserved as the "Pre-pole defaults" curated preset.
 */
export const THREE_TUNING_DEFAULTS: ThreeTuning = {
  particleCount: 140000,
  /** Broad disk — the reference disturbs a wide band of letter material
   * per stroke, not a narrow channel. */
  cursorRadius: 130,
  /** Near-zero void — the reference shows a BRIGHT leading lobe where
   * particles bunch under additive blending, not a clean hole. */
  cursorDisplacement: 6,
  /** Pull from current position toward the behind-cursor anchor each frame. */
  carryStrength: 0.94,
  trailDisplacement: 35,
  trailSpeedCap: 300,
  /** Snappy in-disk follow so the whole disk moves with the cursor. */
  inBlend: 16,
  /** outBlend=0.35 → slower drift home = longer-lived disturbance. */
  outBlend: 0.35,
  pointSize: 2.5,
  /** Every particle that leaves the disk enters wake playback. */
  trailingProbability: 1,
  trailFollowMs: 3200,
  wakePace: 0.48,
  wakePaceJitter: 0.35,
  wakeTimeOffsetMs: 1500,
  wakeAlongStretchBmp: 22,
  wakeBandSpreadBmp: 22,
  wakeReleaseStaggerMs: 80,
  debugOverlay: false,
  carryLagBehind: 26,
  sideSwirlForce: 9,
  frontPush: 3.5,
  backInward: 2.5,
  motionGateSpeed: 1.2,
  falloffPower: 1.4,
  wakeCurlHz: 0.3,
  settleMs: 1800,
  settleWobbleAmp: 9,
  /** Field mode OFF by default — the 2026-06-13 field-on defaults shipped
   * with compounding magnitudes (deposit ×1.8 · radius ×1.3 · ride ×2 ·
   * spring-suppression ×2.4, multiplied through the donut falloff's
   * radius/4 peak) and a light stroke cascaded into a storm that stripped
   * the whole wordmark. Default behaviour is back to the capture-verified
   * wake-playback model; the fluid sim stays available behind this
   * checkbox with detuned, cell-capped values for supervised tuning. */
  fieldMode: false,
  fieldStrength: 0.15,
  fieldRadius: 30,
  fieldAdvection: 0.7,
  fieldDiffusion: 0.05,
  fieldProjection: 0.7,
  fieldDecay: 1.0,
  fieldRide: 0.1,
  fieldActivation: 4,
  fieldCellCap: 18,
  homeSpring: 0.02,
  energizedSpringScale: 0.35,
  fieldFriction: 0.45,
}

/** Keys of `ThreeTuning` whose value is a number — excludes booleans like
 * `debugOverlay` so sliders can index without a runtime narrowing. */
type NumericTuningKey = {
  [K in keyof ThreeTuning]: ThreeTuning[K] extends number ? K : never
}[keyof ThreeTuning]

type SliderDef = {
  key: NumericTuningKey
  label: string
  min: number
  max: number
  step: number
  format?: (v: number) => string
  description?: string
}

const SLIDERS: SliderDef[] = [
  {
    key: "particleCount",
    label: "Particle count",
    min: 5000,
    max: 300000,
    step: 1000,
    format: (v) => `${(v / 1000).toFixed(0)}k`,
    description:
      "Total particles sampled from the wordmark. ~140k is Newmix density. Changing this rebuilds the buffer.",
  },
  {
    key: "cursorRadius",
    label: "Cursor radius",
    min: 30,
    max: 300,
    step: 5,
    format: (v) => `${v.toFixed(0)} px`,
    description:
      "World-space radius of the cursor influence disk. Larger = more particles disturbed per stroke.",
  },
  {
    key: "cursorDisplacement",
    label: "Void radius",
    min: 0,
    max: 60,
    step: 1,
    format: (v) => `${v.toFixed(0)} px`,
    description:
      "Dead-zone radius at cursor tip. Particles pulled closer than this are pushed back to this distance, keeping a clean empty hole under the cursor.",
  },
  {
    key: "carryStrength",
    label: "Carry strength",
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    description:
      "How strongly particles are pulled toward the cursor (0 = no pull, 1 = snap to cursor). Combined with entry-blend, this creates the comet head.",
  },
  {
    key: "inBlend",
    label: "Entry blend",
    min: 1,
    max: 60,
    step: 0.5,
    format: (v) => v.toFixed(1),
    description:
      "How fast particles chase the cursor target each frame. Lower = slower chase = longer in-motion lag.",
  },
  {
    key: "outBlend",
    label: "Return blend",
    min: 0.1,
    max: 10,
    step: 0.1,
    format: (v) => v.toFixed(1),
    description:
      "How fast non-trailing particles drift home after cursor leaves. Lower = slower settle.",
  },
  {
    key: "trailingProbability",
    label: "Trail probability",
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    description:
      "Fraction of exiting particles that enter wake playback. Default 1 = every captured particle trails the cursor path.",
  },
  {
    key: "carryLagBehind",
    label: "Carry lag behind",
    min: 0,
    max: 80,
    step: 1,
    format: (v) => `${v.toFixed(0)} px`,
    description:
      "In-disk anchor sits this many world units behind the cursor along −motion so grains drag in the wake instead of stacking on the tip.",
  },
  {
    key: "sideSwirlForce",
    label: "Side swirl",
    min: 0,
    max: 20,
    step: 0.25,
    format: (v) => v.toFixed(1),
    description:
      "Counter-rotating tangential offset — particles on opposite sides of the motion vector sweep apart (Newmix-style).",
  },
  {
    key: "trailFollowMs",
    label: "Trail follow",
    min: 200,
    max: 6000,
    step: 50,
    format: (v) => `${(v / 1000).toFixed(2)} s`,
    description:
      "How long each released particle traces the cursor path before its wake ends and it springs home.",
  },
  {
    key: "wakePace",
    label: "Wake pace",
    min: 0.1,
    max: 1.5,
    step: 0.01,
    format: (v) => v.toFixed(2),
    description:
      "Playback speed of the cursor-history playhead. <1 = particle lags behind cursor (longer visible trail); >1 = catches up.",
  },
  {
    key: "wakePaceJitter",
    label: "Pace jitter",
    min: 0,
    max: 0.9,
    step: 0.01,
    format: (v) => v.toFixed(2),
    description:
      "± fraction of per-particle pace variance — spreads particles along the path so the trail reads as a band rather than a bead.",
  },
  {
    key: "wakeTimeOffsetMs",
    label: "Time offset",
    min: 0,
    max: 3000,
    step: 50,
    format: (v) => `${(v / 1000).toFixed(2)} s`,
    description:
      "Max per-particle backward time-offset. Biased toward the front of the wake, so most particles hug the cursor with a thinning tail.",
  },
  {
    key: "wakeAlongStretchBmp",
    label: "Along-stretch",
    min: 0,
    max: 60,
    step: 1,
    format: (v) => `${v.toFixed(0)} px`,
    description:
      "Signed offset along the cursor heading. Spreads particles lengthwise so the trail reads as a long ribbon, not a tight clump.",
  },
  {
    key: "wakeBandSpreadBmp",
    label: "Band spread",
    min: 0,
    max: 40,
    step: 1,
    format: (v) => `${v.toFixed(0)} px`,
    description:
      "Perpendicular spread from the path. Lateral width of the ribbon; tapers toward the tail.",
  },
  {
    key: "wakeReleaseStaggerMs",
    label: "Release stagger",
    min: 0,
    max: 1500,
    step: 25,
    format: (v) => `${v.toFixed(0)} ms`,
    description:
      "Particle-by-particle delay before playback starts after release. Staggered staggers produce the comet-tail growth from the cursor outward.",
  },
  {
    key: "wakeCurlHz",
    label: "Wake curl",
    min: 0,
    max: 1.2,
    step: 0.05,
    format: (v) => `${v.toFixed(2)} Hz`,
    description:
      "Billow frequency of the wake band. 0 = straight comb ribbon; >0 = particles oscillate across the path so the trail curls into tongues (Newmix-style).",
  },
  {
    key: "settleMs",
    label: "Settle time",
    min: 0,
    max: 5000,
    step: 100,
    format: (v) => `${(v / 1000).toFixed(1)} s`,
    description:
      "After the wake ends, the particle meanders home for this long instead of beelining — the slow diffusive recovery the reference shows. 0 disables.",
  },
  {
    key: "settleWobbleAmp",
    label: "Settle wobble",
    min: 0,
    max: 30,
    step: 1,
    format: (v) => `${v.toFixed(0)} px`,
    description:
      "Wobble amplitude during the settle meander. Decays to 0 over the settle time.",
  },
  {
    key: "fieldStrength",
    label: "Field deposit",
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    description:
      "How much velocity each stroke splat deposits into the fluid grid. The master energy knob for field mode.",
  },
  {
    key: "fieldRadius",
    label: "Field splat radius",
    min: 15,
    max: 200,
    step: 5,
    format: (v) => `${v.toFixed(0)} px`,
    description:
      "Deposit splat radius (1/r donut falloff). Larger = wider band of fluid stirred per stroke.",
  },
  {
    key: "fieldAdvection",
    label: "Field advection",
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
    description:
      "Velocity moves with itself (semi-Lagrangian). This is what makes deposited energy travel as a directional wake instead of staying put.",
  },
  {
    key: "fieldProjection",
    label: "Field projection",
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
    description:
      "Pressure projection — removes divergence so stirs curl into persistent vortices instead of smearing outward. The signature newmix ingredient.",
  },
  {
    key: "fieldDiffusion",
    label: "Field diffusion",
    min: 0,
    max: 0.25,
    step: 0.01,
    format: (v) => v.toFixed(2),
    description: "Sideways energy seep per frame — softens the wake's edges.",
  },
  {
    key: "fieldDecay",
    label: "Field decay",
    min: 0.05,
    max: 2,
    step: 0.05,
    format: (v) => `${v.toFixed(2)} /s`,
    description:
      "Fraction of fluid energy lost per second. Lower = the churn lingers longer after you stop stirring.",
  },
  {
    key: "fieldRide",
    label: "Field ride",
    min: 0,
    max: 0.6,
    step: 0.01,
    format: (v) => v.toFixed(2),
    description:
      "How strongly particles couple to the local fluid velocity each frame.",
  },
  {
    key: "fieldActivation",
    label: "Field activation",
    min: 0,
    max: 12,
    step: 0.1,
    format: (v) => v.toFixed(1),
    description:
      "Local fluid magnitude above which a particle is energized (home spring suppressed, fluid owns it). THE locality knob — raise it until letters away from your stroke stop moving.",
  },
  {
    key: "fieldCellCap",
    label: "Field speed cap",
    min: 5,
    max: 40,
    step: 1,
    format: (v) => `${v.toFixed(0)} px/f`,
    description:
      "Hard ceiling on fluid speed per cell. Bounds how much energy a stroke can carry no matter how fast you flick.",
  },
  {
    key: "homeSpring",
    label: "Home spring",
    min: 0.001,
    max: 0.06,
    step: 0.001,
    format: (v) => v.toFixed(3),
    description:
      "Return-to-wordmark spring once the local fluid quiets. Higher = firmer snap back.",
  },
  {
    key: "energizedSpringScale",
    label: "Energized spring",
    min: 0,
    max: 1,
    step: 0.02,
    format: (v) => v.toFixed(2),
    description:
      "Spring multiplier while energized. Small = particles surrender to the fluid until it dies down.",
  },
  {
    key: "fieldFriction",
    label: "Field friction",
    min: 0.2,
    max: 0.98,
    step: 0.01,
    format: (v) => v.toFixed(2),
    description:
      "Per-frame velocity damping in field mode. Lower = heavier fluid, motion dies quickly without re-energizing.",
  },
  {
    key: "pointSize",
    label: "Point size",
    min: 0.5,
    max: 8,
    step: 0.1,
    format: (v) => v.toFixed(1),
    description: "Drawn size of each particle.",
  },
]

/** v10: 2026-06-13 — field mode pulled back to opt-in after the field-on
 * defaults proved explosive on the live site (chain-reaction wipeout from
 * a light stroke). Bumped so fieldMode:false lands over stored v9. */
const LS_KEY = "particle-threejs-tuning-v10"

export function loadStoredTuning(): ThreeTuning {
  if (typeof window === "undefined") return THREE_TUNING_DEFAULTS
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (raw == null) return THREE_TUNING_DEFAULTS
    const parsed = JSON.parse(raw) as Partial<ThreeTuning>
    return { ...THREE_TUNING_DEFAULTS, ...parsed }
  } catch {
    return THREE_TUNING_DEFAULTS
  }
}

function saveStoredTuning(t: ThreeTuning) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(t))
  } catch {
    /* quota / private mode — ignore */
  }
}

type Props = {
  tuning: ThreeTuning
  onChange: (next: ThreeTuning) => void
}

export default function ThreeTunerPanel({ tuning, onChange }: Props) {
  const [open, setOpen] = useState(true)
  const [userPresets, setUserPresets] = useState<Preset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState<string>("")

  /** Load user presets on mount. */
  useEffect(() => {
    setUserPresets(loadUserPresets())
  }, [])

  useEffect(() => {
    saveStoredTuning(tuning)
  }, [tuning])

  const update = useCallback(
    (key: NumericTuningKey, value: number) => {
      onChange({ ...tuning, [key]: value })
    },
    [onChange, tuning]
  )

  const reset = useCallback(() => {
    onChange({ ...THREE_TUNING_DEFAULTS })
    saveStoredTuning(THREE_TUNING_DEFAULTS)
    setSelectedPresetId("")
  }, [onChange])

  const allPresets = useMemo<Preset[]>(
    () => [...CURATED_PRESETS, ...userPresets],
    [userPresets]
  )

  const handleSelectPreset = useCallback(
    (id: string) => {
      setSelectedPresetId(id)
      if (id === "") return
      const p = allPresets.find((x) => x.id === id)
      if (p == null) return
      onChange({ ...applyPreset(p), debugOverlay: tuning.debugOverlay })
    },
    [allPresets, onChange, tuning.debugOverlay]
  )

  const handleSaveCurrent = useCallback(() => {
    const defaultName = `Preset ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`
    const name = window.prompt(
      "Name this preset (saved to localStorage):",
      defaultName
    )
    if (name == null) return
    const next = appendUserPreset(userPresets, name, tuning)
    setUserPresets(next)
    const justSaved = next[next.length - 1]
    if (justSaved != null) setSelectedPresetId(justSaved.id)
  }, [tuning, userPresets])

  const handleDeleteSelected = useCallback(() => {
    if (!selectedPresetId.startsWith("user:")) return
    if (!window.confirm("Delete this saved preset?")) return
    const next = deleteUserPreset(userPresets, selectedPresetId)
    setUserPresets(next)
    setSelectedPresetId("")
  }, [selectedPresetId, userPresets])

  const selectedPreset = allPresets.find((p) => p.id === selectedPresetId)
  const canDelete = selectedPresetId.startsWith("user:")

  return (
    <div className="pointer-events-auto fixed right-4 top-20 z-50 w-72 rounded-lg border border-white/10 bg-black/85 p-3 text-xs text-white/90 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Three.js tuner</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide hover:border-white/50 hover:bg-white/10"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide hover:border-white/50 hover:bg-white/10"
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {open ? (
        <div className="flex max-h-[80vh] flex-col gap-2.5 overflow-y-auto pr-1">
          <div className="rounded border border-white/15 bg-white/5 p-2">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-white/90">
                Preset history
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handleSaveCurrent}
                  className="rounded border border-white/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide hover:border-white/50 hover:bg-white/10"
                  title="Save current sliders as a new preset"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={!canDelete}
                  className="rounded border border-white/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide hover:border-white/50 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                  title="Delete the selected user-saved preset"
                >
                  Del
                </button>
              </div>
            </div>
            <select
              value={selectedPresetId}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="w-full rounded border border-white/15 bg-black/60 px-1.5 py-1 text-[11px] text-white/90 outline-none focus:border-white/40"
            >
              <option value="">— pick a preset —</option>
              <optgroup label="Curated (git history)">
                {CURATED_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              {userPresets.length > 0 ? (
                <optgroup label="Saved">
                  {userPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.savedAt != null
                        ? `  · ${new Date(p.savedAt).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            {selectedPreset?.note != null ? (
              <p className="mt-1 text-[10px] leading-tight text-white/50">
                {selectedPreset.note}
              </p>
            ) : null}
          </div>

          <label className="flex items-center justify-between rounded border border-white/15 bg-white/5 px-2 py-1.5">
            <span className="text-[11px] font-semibold text-white/90">
              Field mode (fluid sim)
            </span>
            <input
              type="checkbox"
              checked={tuning.fieldMode}
              onChange={(e) =>
                onChange({ ...tuning, fieldMode: e.target.checked })
              }
              className="h-3 w-3 accent-cyan-400"
            />
          </label>

          <label className="flex items-center justify-between rounded border border-white/15 bg-white/5 px-2 py-1.5">
            <span className="text-[11px] font-semibold text-white/90">
              Debug overlay
            </span>
            <input
              type="checkbox"
              checked={tuning.debugOverlay}
              onChange={(e) =>
                onChange({ ...tuning, debugOverlay: e.target.checked })
              }
              className="h-3 w-3 accent-fuchsia-400"
            />
          </label>

          {SLIDERS.map((def) => {
            const v = tuning[def.key]
            const formatted =
              def.format != null
                ? def.format(v)
                : v % 1 === 0
                  ? String(v)
                  : v.toFixed(2)
            return (
              <label key={def.key} className="block">
                <div className="mb-0.5 flex items-baseline justify-between gap-2">
                  <span className="text-white/80">{def.label}</span>
                  <span className="font-mono text-white/50">{formatted}</span>
                </div>
                <input
                  type="range"
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={v}
                  onChange={(e) =>
                    update(def.key, parseFloat(e.target.value))
                  }
                  className="w-full accent-white"
                />
                {def.description != null ? (
                  <p className="mt-0.5 text-[10px] leading-tight text-white/40">
                    {def.description}
                  </p>
                ) : null}
              </label>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
