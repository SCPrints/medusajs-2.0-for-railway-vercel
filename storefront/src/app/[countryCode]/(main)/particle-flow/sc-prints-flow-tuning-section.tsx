"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"

import ScPrintsFlow from "./sc-prints-flow"
import type { ScPrintsFlowTuning } from "./sc-prints-flow-tuning"
import { mergeScPrintsFlowTuning } from "./sc-prints-flow-tuning"

const LS_KEY = "sc-prints-flow-tuning-v1"

const INT_KEYS = new Set<keyof ScPrintsFlowTuning>([
  "radius",
  "spread",
  "holdMs",
  "holdJitterMs",
  "particleStride",
])

function loadTuning(): ScPrintsFlowTuning {
  if (typeof window === "undefined") {
    return mergeScPrintsFlowTuning()
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) {
      return mergeScPrintsFlowTuning()
    }
    const parsed = JSON.parse(raw) as Partial<ScPrintsFlowTuning>
    return mergeScPrintsFlowTuning(parsed)
  } catch {
    return mergeScPrintsFlowTuning()
  }
}

type SliderSpec = {
  key: keyof ScPrintsFlowTuning
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
      "Distance from cursor at which particles start being captured. Larger = wider cleared channel.",
    min: 20,
    max: 200,
    step: 1,
  },
  {
    key: "spread",
    label: "Lateral spread (px)",
    description:
      "How far past the radius particles are pushed before being abandoned. Higher = thicker side ribbons; 0 = thin rim.",
    min: 0,
    max: 80,
    step: 1,
  },
  {
    key: "motionThreshold",
    label: "Motion threshold (px/frame)",
    description:
      "Minimum cursor speed before displacement engages. Stationary cursor doesn't disturb particles.",
    min: 0,
    max: 5,
    step: 0.1,
  },
  {
    key: "velSmoothing",
    label: "Velocity smoothing",
    description:
      "Low-pass on cursor direction. Higher = snappier direction tracking; lower = smoother through curves.",
    min: 0.1,
    max: 1,
    step: 0.02,
  },
  {
    key: "holdMs",
    label: "Hold time (ms)",
    description:
      "How long a displaced particle stays visibly stationary in the wake before drifting home.",
    min: 0,
    max: 6000,
    step: 50,
  },
  {
    key: "holdJitterMs",
    label: "Hold jitter (ms)",
    description:
      "Per-particle randomness added to hold time, so the wake doesn't release as a uniform front.",
    min: 0,
    max: 2000,
    step: 25,
  },
  {
    key: "returnSpring",
    label: "Return spring",
    description:
      "Pull-toward-home strength during the drift phase. Lower = slower drift; higher = quicker snap back.",
    min: 0.001,
    max: 0.05,
    step: 0.001,
  },
  {
    key: "returnFriction",
    label: "Return friction",
    description:
      "Per-frame velocity decay during drift. High (~0.94) = critically damped sand-fall; lower = more bounce.",
    min: 0.7,
    max: 0.99,
    step: 0.005,
  },
  {
    key: "returnGravity",
    label: "Return gravity",
    description:
      "Downward bias during drift. Produces the sand-through-hourglass visual as particles fall back to home.",
    min: 0,
    max: 0.5,
    step: 0.01,
  },
  {
    key: "particleStride",
    label: "Particle sample stride (px)",
    description:
      "Pixel step when sampling the wordmark. 1 = densest (slowest); 3-4 = sparse but fast. Resamples on resize.",
    min: 1,
    max: 6,
    step: 1,
  },
  {
    key: "particleSize",
    label: "Particle size (px)",
    description:
      "Drawn size of each particle. 1 = single pixel; 1.5-2 = bolder, brighter wordmark.",
    min: 0.5,
    max: 3,
    step: 0.1,
  },
]

function formatValue(key: keyof ScPrintsFlowTuning, v: number): string {
  if (INT_KEYS.has(key)) {
    return String(Math.round(v))
  }
  if (key === "returnSpring") {
    return v.toFixed(3)
  }
  if (key === "returnFriction") {
    return v.toFixed(3)
  }
  return v.toFixed(2)
}

function clampTuningToSliders(t: ScPrintsFlowTuning): ScPrintsFlowTuning {
  let next = mergeScPrintsFlowTuning(t)
  for (const spec of SLIDERS) {
    const v = next[spec.key]
    const clamped = Math.min(spec.max, Math.max(spec.min, v))
    next = { ...next, [spec.key]: clamped }
  }
  return next
}

export function ScPrintsFlowTuningSection() {
  const [tuning, setTuning] = useState<ScPrintsFlowTuning>(() => loadTuning())
  const restorePointRef = useRef<ScPrintsFlowTuning | null>(null)

  useLayoutEffect(() => {
    restorePointRef.current = mergeScPrintsFlowTuning(tuning)
  }, [])

  const saveSettings = useCallback(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(tuning))
    } catch {
      /* ignore quota */
    }
  }, [tuning])

  const updateRestorePoint = useCallback(() => {
    restorePointRef.current = mergeScPrintsFlowTuning(tuning)
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
    setTuning(mergeScPrintsFlowTuning())
    try {
      localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <div className="border-b border-white/15">
      <p className="border-b border-white/15 px-4 py-3 text-center text-sm text-white/70 sm:px-6">
        SC Prints — newmix-style deposit-and-hold particle wake (lab; sliders only apply on this page)
      </p>
      <ScPrintsFlow tuning={tuning} />
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
