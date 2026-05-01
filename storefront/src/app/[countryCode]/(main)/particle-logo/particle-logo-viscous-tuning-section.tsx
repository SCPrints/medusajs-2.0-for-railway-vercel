"use client"

import { useCallback, useEffect, useState } from "react"

import HomeParticleLogoHero from "@modules/home/components/home-particle-logo-hero"
import type { ViscousCoffeeLiveTuning } from "@modules/home/components/home-particle-logo-hero/viscous-coffee-live-tuning"
import {
  mergeViscousCoffeeLiveTuning,
} from "@modules/home/components/home-particle-logo-hero/viscous-coffee-live-tuning"

const LS_KEY = "viscous-coffee-live-tuning-v1"

const INT_KEYS = new Set<keyof ViscousCoffeeLiveTuning>([
  "dragRadius",
  "trailMaxPoints",
  "lineRadiusBmp",
  "erodeEveryFrames",
  "wakeParticleCount",
  "wakeTailBackSamples",
  "wakeSpreadBmp",
])

function loadTuning(): ViscousCoffeeLiveTuning {
  if (typeof window === "undefined") {
    return mergeViscousCoffeeLiveTuning()
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) {
      return mergeViscousCoffeeLiveTuning()
    }
    const parsed = JSON.parse(raw) as Partial<ViscousCoffeeLiveTuning>
    return mergeViscousCoffeeLiveTuning(parsed)
  } catch {
    return mergeViscousCoffeeLiveTuning()
  }
}

type SliderSpec = {
  key: keyof ViscousCoffeeLiveTuning
  label: string
  min: number
  max: number
  step: number
}

const SLIDERS: SliderSpec[] = [
  { key: "dragRadius", label: "Drag radius", min: 20, max: 200, step: 1 },
  {
    key: "trailMaxPoints",
    label: "Trail max points",
    min: 20,
    max: 320,
    step: 1,
  },
  {
    key: "sampleDistBmp",
    label: "Trail sample dist (px)",
    min: 1,
    max: 14,
    step: 0.5,
  },
  { key: "pathDecay", label: "Path decay", min: 0.75, max: 0.999, step: 0.005 },
  {
    key: "lineRadiusBmp",
    label: "Line corridor radius",
    min: 12,
    max: 120,
    step: 1,
  },
  {
    key: "alongStrength",
    label: "Along-path strength",
    min: 0,
    max: 2.5,
    step: 0.02,
  },
  { key: "shearStrength", label: "Shear strength", min: 0, max: 2, step: 0.02 },
  {
    key: "springStiffness",
    label: "Home spring",
    min: 0.005,
    max: 0.2,
    step: 0.005,
  },
  { key: "friction", label: "Friction", min: 0.78, max: 0.995, step: 0.002 },
  {
    key: "erodeEveryFrames",
    label: "Erode every N frames",
    min: 1,
    max: 24,
    step: 1,
  },
  {
    key: "spoonRepulseFalloffPower",
    label: "Spoon falloff power",
    min: 0,
    max: 3,
    step: 0.05,
  },
  {
    key: "spoonFrontPush",
    label: "Spoon front push",
    min: 0,
    max: 16,
    step: 0.1,
  },
  {
    key: "spoonSideVortex",
    label: "Spoon side vortex",
    min: 0,
    max: 10,
    step: 0.1,
  },
  {
    key: "spoonRingSwirl",
    label: "Spoon ring swirl",
    min: 0,
    max: 12,
    step: 0.1,
  },
  {
    key: "spoonBackInward",
    label: "Spoon back inward",
    min: 0,
    max: 8,
    step: 0.1,
  },
  {
    key: "spoonHalfRadiusOrbit",
    label: "Spoon half-R orbit",
    min: 0,
    max: 8,
    step: 0.1,
  },
  { key: "spoonBackWash", label: "Spoon back wash", min: 0, max: 6, step: 0.05 },
  {
    key: "spoonVelSmooth",
    label: "Spoon vel smooth",
    min: 0.05,
    max: 0.95,
    step: 0.02,
  },
  {
    key: "wakeParticleCount",
    label: "Wake particle count (rebuilds pool)",
    min: 40,
    max: 520,
    step: 10,
  },
  {
    key: "wakeArcHeadKeep",
    label: "Wake arc head keep",
    min: 0.5,
    max: 1,
    step: 0.01,
  },
  {
    key: "wakeTailBackSamples",
    label: "Wake tail back samples",
    min: 0,
    max: 24,
    step: 1,
  },
  {
    key: "wakeArcDistribGamma",
    label: "Wake arc gamma",
    min: 0.5,
    max: 3,
    step: 0.02,
  },
  { key: "wakeSpreadBmp", label: "Wake spread (px)", min: 0, max: 40, step: 1 },
  {
    key: "wakeSpringStiffness",
    label: "Wake spring",
    min: 0.01,
    max: 0.2,
    step: 0.005,
  },
  { key: "wakeFriction", label: "Wake friction", min: 0.85, max: 0.995, step: 0.002 },
  { key: "wakeAlongDrag", label: "Wake along drag", min: 0, max: 2, step: 0.02 },
  { key: "wakeAlphaMult", label: "Wake alpha mult", min: 0.2, max: 1, step: 0.01 },
]

function formatValue(key: keyof ViscousCoffeeLiveTuning, v: number): string {
  if (INT_KEYS.has(key)) {
    return String(Math.round(v))
  }
  if (
    key === "pathDecay" ||
    key === "wakeArcHeadKeep" ||
    key === "wakeAlphaMult"
  ) {
    return v.toFixed(3)
  }
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

export function ParticleLogoViscousTuningSection() {
  const [tuning, setTuning] = useState<ViscousCoffeeLiveTuning>(() =>
    loadTuning()
  )

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(tuning))
    } catch {
      /* ignore quota */
    }
  }, [tuning])

  const reset = useCallback(() => {
    setTuning(mergeViscousCoffeeLiveTuning())
    try {
      localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <div className="border-b border-white/15">
      <p className="border-b border-white/15 px-4 py-3 text-center text-sm text-white/70 sm:px-6">
        Viscous coffee (trail, shear, slow fill-in) — live tuning
      </p>
      <HomeParticleLogoHero
        presentation="embedded"
        interactionMode="viscousCoffee"
        sectionAriaLabel="SC Prints — viscous coffee particle logo"
        viscousCoffeeLiveTuning={tuning}
      />
      <div className="max-h-[min(70vh,520px)] overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-3">
          <p className="text-xs text-white/55">
            Sliders update physics immediately. Wake particle count triggers a
            short rebuild. Values persist in{" "}
            <code className="rounded bg-white/10 px-1">localStorage</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-white/25 bg-white/5 px-3 py-1.5 text-xs text-white/85 hover:bg-white/10"
              onClick={reset}
            >
              Reset to defaults + clear saved
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
                  <span className="font-mono text-white/90">
                    {formatValue(spec.key, tuning[spec.key])}
                  </span>
                </span>
                <input
                  type="range"
                  className="mt-2 w-full accent-[#3dcfc2]"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={tuning[spec.key]}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    const next = INT_KEYS.has(spec.key)
                      ? Math.round(v)
                      : v
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
