"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"

import HomeParticleLogoHero from "@modules/home/components/home-particle-logo-hero"
import type { NewmixLiveTuning } from "@modules/home/components/home-particle-logo-hero/newmix-live-tuning"
import { mergeNewmixLiveTuning } from "@modules/home/components/home-particle-logo-hero/newmix-live-tuning"

const LS_KEY = "newmix-live-tuning-v1"

const INT_KEYS = new Set<keyof NewmixLiveTuning>([
  "radius",
  "trailFollowMs",
])

function loadTuning(): NewmixLiveTuning {
  if (typeof window === "undefined") {
    return mergeNewmixLiveTuning()
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) {
      return mergeNewmixLiveTuning()
    }
    const parsed = JSON.parse(raw) as Partial<NewmixLiveTuning>
    return mergeNewmixLiveTuning(parsed)
  } catch {
    return mergeNewmixLiveTuning()
  }
}

type SliderSpec = {
  key: keyof NewmixLiveTuning
  label: string
  description: string
  min: number
  max: number
  step: number
}

const SLIDERS: SliderSpec[] = [
  {
    key: "radius",
    label: "Capture radius (px)",
    description:
      "Bitmap-px disk around the cursor that captures particles. Larger = more dots swept per pass.",
    min: 30,
    max: 220,
    step: 1,
  },
  {
    key: "velSmoothing",
    label: "Motion vector smoothing",
    description:
      "Low-pass on inferred mouse motion direction. Higher = snappier heading, lower = laggy heading (smoother swirls on direction changes).",
    min: 0.05,
    max: 0.95,
    step: 0.02,
  },
  {
    key: "sideSwirlForce",
    label: "Side swirl force",
    description:
      "Counter-rotating tangential impulse on each side of the motion direction (left vs right of travel curl opposite ways). Drives the dual-swirl look.",
    min: 0,
    max: 24,
    step: 0.1,
  },
  {
    key: "frontPush",
    label: "Front push",
    description:
      "Outward radial shove ahead of the motion direction. Clears the leading tip of the disk so particles roll around the sides.",
    min: 0,
    max: 16,
    step: 0.05,
  },
  {
    key: "backInward",
    label: "Back inward pinch",
    description:
      "Pull behind the motion direction so released particles converge into the wake instead of fanning outward.",
    min: 0,
    max: 12,
    step: 0.05,
  },
  {
    key: "falloffPower",
    label: "Falloff power",
    description:
      "Shape of force vs distance from cursor inside the disk. Higher = sharper falloff near the rim; lower = more uniform.",
    min: 0,
    max: 4,
    step: 0.05,
  },
  {
    key: "trailFollowMs",
    label: "Wake follow duration (ms)",
    description:
      "How long a released particle trails the cursor before springing home. Re-capturing the particle resets this timer.",
    min: 200,
    max: 8000,
    step: 50,
  },
  {
    key: "trailFollowAccel",
    label: "Wake follow accel",
    description:
      "Per-frame acceleration toward the trail/cursor target during the wake follow window. Higher = particles chase faster.",
    min: 0,
    max: 1.5,
    step: 0.01,
  },
  {
    key: "trailFollowPathBias",
    label: "Wake path bias",
    description:
      "At release, weight on the most-recent trail sample vs. the live cursor (decays as the deadline approaches). Higher = particles ride the path the mouse drew; lower = they chase the cursor head.",
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    key: "friction",
    label: "Friction",
    description:
      "Per-frame velocity multiplier on logo particles in newmix mode (higher = more glide, lower = quicker stop).",
    min: 0.78,
    max: 0.995,
    step: 0.002,
  },
  {
    key: "springStiffnessMult",
    label: "Home spring multiplier",
    description:
      "Scales the home-position spring while in newmix mode (relative to the default 0.075 stiffness). Lower = particles take longer to return to the wordmark after the wake.",
    min: 0.1,
    max: 1.5,
    step: 0.02,
  },
  {
    key: "homeSpringSuppress",
    label: "Home spring suppress (in disk)",
    description:
      "Inside the capture disk, reduce the home spring by this factor so captured dots can drift around the cursor before being released.",
    min: 0,
    max: 0.99,
    step: 0.01,
  },
  {
    key: "releaseKickMult",
    label: "Release kick",
    description:
      "Single-frame velocity multiplier applied on the edge-exit frame. Slightly above 1 makes released particles leave with extra residual swirl velocity.",
    min: 0.8,
    max: 1.6,
    step: 0.01,
  },
]

function formatValue(key: keyof NewmixLiveTuning, v: number): string {
  if (INT_KEYS.has(key)) {
    return String(Math.round(v))
  }
  if (key === "trailFollowPathBias" || key === "homeSpringSuppress") {
    return v.toFixed(2)
  }
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

function clampTuningToSliders(t: NewmixLiveTuning): NewmixLiveTuning {
  let next = mergeNewmixLiveTuning(t)
  for (const spec of SLIDERS) {
    const v = next[spec.key]
    const clamped = Math.min(spec.max, Math.max(spec.min, v))
    next = { ...next, [spec.key]: clamped }
  }
  return next
}

export function ParticleLogoNewmixTuningSection() {
  const [tuning, setTuning] = useState<NewmixLiveTuning>(() => loadTuning())
  const restorePointRef = useRef<NewmixLiveTuning | null>(null)

  useLayoutEffect(() => {
    restorePointRef.current = mergeNewmixLiveTuning(tuning)
  }, [])

  const saveSettings = useCallback(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(tuning))
    } catch {
      /* ignore quota */
    }
  }, [tuning])

  const updateRestorePoint = useCallback(() => {
    restorePointRef.current = mergeNewmixLiveTuning(tuning)
  }, [tuning])

  const restoreToRestorePoint = useCallback(() => {
    const snap = restorePointRef.current
    if (!snap) {
      return
    }
    const ok = window.confirm(
      "Restore all sliders to your saved restore point? The animation will match those values."
    )
    if (!ok) {
      return
    }
    setTuning(clampTuningToSliders(snap))
  }, [])

  const resetFactory = useCallback(() => {
    setTuning(mergeNewmixLiveTuning())
    try {
      localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <div className="border-b border-white/15">
      <p className="border-b border-white/15 px-4 py-3 text-center text-sm text-white/70 sm:px-6">
        Newmix-style capture & wake (direction-aware swirl + 3s trail follow) —{" "}
        <code className="rounded bg-white/10 px-1 text-xs">HomeParticleLogoHero</code>{" "}
        lab mode (sliders only apply on this page)
      </p>
      <HomeParticleLogoHero
        presentation="embedded"
        interactionMode="newmix"
        sectionAriaLabel="SC Prints — newmix particle logo"
        newmixLiveTuning={tuning}
      />
      <div className="max-h-[min(70vh,520px)] overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-3">
          <p className="text-xs text-white/55">
            Sliders update physics immediately. Use{" "}
            <strong className="font-medium text-white/70">Save settings</strong>{" "}
            to write the current sliders to{" "}
            <code className="rounded bg-white/10 px-1">localStorage</code>{" "}
            (reload keeps them). Saving does not reset the animation.{" "}
            <strong className="font-medium text-white/70">Update restore point</strong>{" "}
            remembers the current values;{" "}
            <strong className="font-medium text-white/70">Restore to restore point</strong>{" "}
            asks for confirmation before applying that snapshot.
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
              Reset to factory defaults (clear saved file)
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
