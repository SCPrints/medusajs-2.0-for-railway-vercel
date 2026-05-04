"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"

import HomeParticleLogoHero from "@modules/home/components/home-particle-logo-hero"
import type { FlowLiveTuning } from "@modules/home/components/home-particle-logo-hero/flow-live-tuning"
import { mergeFlowLiveTuning } from "@modules/home/components/home-particle-logo-hero/flow-live-tuning"

const LS_KEY = "flow-live-tuning-v2"

const INT_KEYS = new Set<keyof FlowLiveTuning>([
  "radius",
  "carryDurationMs",
])

function loadTuning(): FlowLiveTuning {
  if (typeof window === "undefined") {
    return mergeFlowLiveTuning()
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) {
      return mergeFlowLiveTuning()
    }
    const parsed = JSON.parse(raw) as Partial<FlowLiveTuning>
    return mergeFlowLiveTuning(parsed)
  } catch {
    return mergeFlowLiveTuning()
  }
}

type SliderSpec = {
  key: keyof FlowLiveTuning
  label: string
  description: string
  min: number
  max: number
  step: number
}

const SLIDERS: SliderSpec[] = [
  {
    key: "radius",
    label: "Cursor radius (px)",
    description:
      "Solid-obstacle radius. Particles inside are displaced to the rim. Larger = bigger displacement zone.",
    min: 20,
    max: 200,
    step: 1,
  },
  {
    key: "displacementStrength",
    label: "Displacement strength",
    description:
      "How instantly particles snap to the rim. 1.0 = teleport to edge; lower = smoother slide outward.",
    min: 0.1,
    max: 1,
    step: 0.02,
  },
  {
    key: "tangentialBias",
    label: "Tangential flow bias",
    description:
      "Sideways component of the displacement. Higher = particles slide AROUND the cursor like fluid flowing around an obstacle. 0 = pure radial push.",
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    key: "carryFactor",
    label: "Carry-along factor",
    description:
      "Fraction of cursor's smoothed velocity transferred to displaced particles. Higher = particles get flung along the cursor's path; longer trails. Lower = brief nudge.",
    min: 0,
    max: 2,
    step: 0.02,
  },
  {
    key: "velSmoothing",
    label: "Velocity smoothing",
    description:
      "Low-pass on cursor velocity. Higher = snappy tracking; lower = smoothed slow-changing direction.",
    min: 0.05,
    max: 1,
    step: 0.02,
  },
  {
    key: "springStiffness",
    label: "Home spring stiffness",
    description:
      "Strength of the pull back to home each frame. Lower = slower, more drifting return; higher = quick snap.",
    min: 0.001,
    max: 0.1,
    step: 0.001,
  },
  {
    key: "friction",
    label: "Friction",
    description:
      "Per-frame velocity decay. Critically damped at friction ≈ 1 - 2·sqrt(spring) for no rebound. Higher = faster damping.",
    min: 0.7,
    max: 0.99,
    step: 0.005,
  },
  {
    key: "gravity",
    label: "Gravity (downward)",
    description:
      "Downward acceleration each frame. Produces the sand-through-hourglass fall as particles return home.",
    min: 0,
    max: 0.5,
    step: 0.01,
  },
  {
    key: "motionGateSpeed",
    label: "Motion gate (px/frame)",
    description:
      "Below this cursor speed, the carry-along velocity transfer fades to 0 — stationary cursor still displaces but doesn't fling.",
    min: 0.1,
    max: 10,
    step: 0.1,
  },
  {
    key: "velocityHandoff",
    label: "Velocity handoff weight",
    description:
      "How much of the new cursor-derived velocity replaces the particle's existing velocity per frame. 1.0 = full replace; lower = smoother momentum continuity.",
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    key: "carryDurationMs",
    label: "Carry duration (ms)",
    description:
      "How long a particle stays in the carry state after being displaced. While carried, it continues receiving cursor velocity each frame so it travels far along the cursor's path. Longer = longer visible trail.",
    min: 200,
    max: 6000,
    step: 50,
  },
  {
    key: "carryStrength",
    label: "Carry acceleration",
    description:
      "Per-frame acceleration toward the cursor's velocity vector while carried. Higher = particles match cursor speed more aggressively, sharper trail.",
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    key: "carryFriction",
    label: "Carry friction",
    description:
      "Velocity multiplier per frame while carried. High (~0.96+) preserves velocity through the carry window; lower = trail dies faster.",
    min: 0.85,
    max: 0.999,
    step: 0.002,
  },
  {
    key: "carryHomeSpringSuppress",
    label: "Carry home-spring suppress",
    description:
      "How much the home spring is muted while carried. 1.0 = home spring fully off (longest trail); lower = partial pull home (shorter trail).",
    min: 0,
    max: 1,
    step: 0.02,
  },
]

function formatValue(key: keyof FlowLiveTuning, v: number): string {
  if (INT_KEYS.has(key)) {
    return String(Math.round(v))
  }
  if (key === "springStiffness") {
    return v.toFixed(3)
  }
  if (key === "friction") {
    return v.toFixed(3)
  }
  return v.toFixed(2)
}

function clampTuningToSliders(t: FlowLiveTuning): FlowLiveTuning {
  let next = mergeFlowLiveTuning(t)
  for (const spec of SLIDERS) {
    const v = next[spec.key]
    const clamped = Math.min(spec.max, Math.max(spec.min, v))
    next = { ...next, [spec.key]: clamped }
  }
  return next
}

export function ParticleFlowTuningSection() {
  const [tuning, setTuning] = useState<FlowLiveTuning>(() => loadTuning())
  const restorePointRef = useRef<FlowLiveTuning | null>(null)

  useLayoutEffect(() => {
    restorePointRef.current = mergeFlowLiveTuning(tuning)
  }, [])

  const saveSettings = useCallback(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(tuning))
    } catch {
      /* ignore quota */
    }
  }, [tuning])

  const updateRestorePoint = useCallback(() => {
    restorePointRef.current = mergeFlowLiveTuning(tuning)
  }, [tuning])

  const restoreToRestorePoint = useCallback(() => {
    const snap = restorePointRef.current
    if (!snap) {
      return
    }
    const ok = window.confirm(
      "Restore all sliders to your saved restore point?"
    )
    if (!ok) {
      return
    }
    setTuning(clampTuningToSliders(snap))
  }, [])

  const resetFactory = useCallback(() => {
    setTuning(mergeFlowLiveTuning())
    try {
      localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <div className="border-b border-white/15">
      <p className="border-b border-white/15 px-4 py-3 text-center text-sm text-white/70 sm:px-6">
        Flow mode (cursor as solid obstacle, particles displace + carry along) —{" "}
        <code className="rounded bg-white/10 px-1 text-xs">HomeParticleLogoHero</code>{" "}
        lab mode (sliders only apply on this page)
      </p>
      <HomeParticleLogoHero
        presentation="fullscreen"
        interactionMode="flow"
        sectionAriaLabel="SC Prints — flow particle logo"
        flowLiveTuning={tuning}
        animatedParticleCap={80000}
      />
      <div className="max-h-[min(70vh,520px)] overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-3">
          <p className="text-xs text-white/55">
            Sliders update physics immediately. Use{" "}
            <strong className="font-medium text-white/70">Save settings</strong>{" "}
            to write the current sliders to{" "}
            <code className="rounded bg-white/10 px-1">localStorage</code>{" "}
            (reload keeps them).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25"
              onClick={saveSettings}
            >
              Save settings
            </button>
            <button
              type="button"
              className="rounded border border-white/25 bg-white/5 px-3 py-1.5 text-xs text-white/85 hover:bg-white/10"
              onClick={updateRestorePoint}
            >
              Update restore point
            </button>
            <button
              type="button"
              className="rounded border border-amber-400/35 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100/95 hover:bg-amber-500/20"
              onClick={restoreToRestorePoint}
            >
              Restore to restore point…
            </button>
            <button
              type="button"
              className="rounded border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white/55 hover:bg-white/10 hover:text-white/75"
              onClick={resetFactory}
            >
              Reset to factory defaults
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SLIDERS.map((spec) => (
              <label
                key={spec.key}
                className="block rounded border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/80"
              >
                <span className="flex justify-between gap-2">
                  <span>{spec.label}</span>
                  <span className="shrink-0 font-mono text-white/90">
                    {formatValue(spec.key, tuning[spec.key])}
                  </span>
                </span>
                <p className="mt-1.5 text-[11px] leading-snug text-white/50">
                  {spec.description}
                </p>
                <input
                  type="range"
                  className="mt-2 w-full accent-[#3dcfc2]"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={Math.min(
                    spec.max,
                    Math.max(spec.min, tuning[spec.key])
                  )}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    const next = INT_KEYS.has(spec.key) ? Math.round(v) : v
                    setTuning((t) => ({ ...t, [spec.key]: next }))
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
