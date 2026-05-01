"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"

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
  /** Short plain-language hint tied to the hero physics implementation. */
  description: string
  min: number
  max: number
  step: number
}

/** Wide ranges so effects are easy to feel; very high wake counts can cost frames. */
const SLIDERS: SliderSpec[] = [
  {
    key: "dragRadius",
    label: "Drag radius",
    description:
      "Radius of the “spoon” cursor influence (screen px). Logo stipple still gates where interaction runs; this is how far from the pointer the push or vortex field applies.",
    min: 20,
    max: 420,
    step: 1,
  },
  {
    key: "trailMaxPoints",
    label: "Trail max points",
    description:
      "Maximum polyline vertices kept for path memory. Longer trails remember more of your stroke but cost a bit more work per frame.",
    min: 20,
    max: 900,
    step: 1,
  },
  {
    key: "sampleDistBmp",
    label: "Trail sample dist (px)",
    description:
      "Minimum pointer movement before another trail point is added. Higher = sparser samples (smoother path, less detail); lower = denser path.",
    min: 0.5,
    max: 36,
    step: 0.5,
  },
  {
    key: "pathDecay",
    label: "Path decay",
    description:
      "Base (0–1) for geometric falloff along the trail: older segments get this raised to a larger power, so values closer to 1 keep distant history influential; smaller values make the stroke forget the tail quickly.",
    min: 0.75,
    max: 0.999,
    step: 0.005,
  },
  {
    key: "lineRadiusBmp",
    label: "Line corridor radius",
    description:
      "Half-width (in px) of the corridor around each trail segment where along-path and shear forces act. Wider = more logo particles feel the drawn path.",
    min: 8,
    max: 240,
    step: 1,
  },
  {
    key: "alongStrength",
    label: "Along-path strength",
    description:
      "Impulse along the trail tangent (direction you drew). Ups the “dragged along the stroke / coffee following the spoon” feel.",
    min: 0,
    max: 6,
    step: 0.02,
  },
  {
    key: "shearStrength",
    label: "Shear strength",
    description:
      "Impulse perpendicular to the path, sign flips by side of the line. Reads as shearing or piling on each side of the groove.",
    min: 0,
    max: 6,
    step: 0.02,
  },
  {
    key: "springStiffness",
    label: "Home spring",
    description:
      "How strongly logo particles are pulled back toward their home (mask) positions each frame after velocity is applied—higher = snappier return, lower = more lingering motion.",
    min: 0.005,
    max: 0.42,
    step: 0.005,
  },
  {
    key: "friction",
    label: "Friction",
    description:
      "Velocity multiplier on logo particles each tick (higher = more glide / less damping, lower = quicker slowdown).",
    min: 0.78,
    max: 0.995,
    step: 0.002,
  },
  {
    key: "erodeEveryFrames",
    label: "Erode every N frames",
    description:
      "When the pointer is outside the logo stipple, the trail drops one old point every this many frames. Higher = slower trail decay.",
    min: 1,
    max: 90,
    step: 1,
  },
  {
    key: "spoonRepulseFalloffPower",
    label: "Spoon falloff power",
    description:
      "Shape of force vs distance from pointer inside the drag radius (raised to this power). Higher = sharper falloff near the edge; lower / 0 = more uniform disk.",
    min: 0,
    max: 6,
    step: 0.05,
  },
  {
    key: "spoonFrontPush",
    label: "Spoon front push",
    description:
      "Outward radial shove ahead of the motion direction (in front of the “spoon”), strongest near the cursor center.",
    min: 0,
    max: 28,
    step: 0.1,
  },
  {
    key: "spoonSideVortex",
    label: "Spoon side vortex",
    description:
      "Tangential swirl to the sides of motion (counter-rotating by which side of the stroke you’re on)—classic side eddies.",
    min: 0,
    max: 18,
    step: 0.1,
  },
  {
    key: "spoonRingSwirl",
    label: "Spoon ring swirl",
    description:
      "Extra tangential flow near the outer shell of the influence disk (rim swirl), distinct from the side vortex lobes.",
    min: 0,
    max: 24,
    step: 0.1,
  },
  {
    key: "spoonBackInward",
    label: "Spoon back inward",
    description:
      "Behind the motion, pulls particles inward toward the cursor (pinch / wake convergence).",
    min: 0,
    max: 16,
    step: 0.1,
  },
  {
    key: "spoonHalfRadiusOrbit",
    label: "Spoon half-R orbit",
    description:
      "Behind the motion, biases flow around half the drag radius—tangential orbit plus small radial correction for a rolling wake.",
    min: 0,
    max: 16,
    step: 0.1,
  },
  {
    key: "spoonBackWash",
    label: "Spoon back wash",
    description:
      "Behind the motion, acceleration opposite the travel direction (wash flowing backward along the stroke).",
    min: 0,
    max: 14,
    step: 0.05,
  },
  {
    key: "spoonVelSmooth",
    label: "Spoon vel smooth",
    description:
      "Low-pass on inferred spoon direction from pointer deltas before forces run—higher = smoother, slower turns; lower = twitchier response.",
    min: 0.05,
    max: 0.95,
    step: 0.02,
  },
  {
    key: "wakeParticleCount",
    label: "Wake particle count (rebuilds pool)",
    description:
      "How many secondary “wake” dots ride the trail. Changing this reallocates the pool (short hitch). Very high counts can cost GPU/CPU time.",
    min: 40,
    max: 900,
    step: 10,
  },
  {
    key: "wakeArcHeadKeep",
    label: "Wake arc head keep",
    description:
      "Clamps how far toward the cursor tip the wake is laid along the trail (1 = full span used; lower = keeps wake samples more toward the older path).",
    min: 0.5,
    max: 1,
    step: 0.01,
  },
  {
    key: "wakeTailBackSamples",
    label: "Wake tail back samples",
    description:
      "Shifts the wake placement further back along the polyline (in vertex steps), so dots hug the tail rather than the leading edge.",
    min: 0,
    max: 48,
    step: 1,
  },
  {
    key: "wakeArcDistribGamma",
    label: "Wake arc gamma",
    description:
      "Nonlinear spacing of wake dots along the trail segment index (gamma on normalized slot). Above 1 bunches dots toward the tail; below 1 spreads toward the head.",
    min: 0.5,
    max: 5,
    step: 0.02,
  },
  {
    key: "wakeSpreadBmp",
    label: "Wake spread (px)",
    description:
      "Random lateral offset (perpendicular to path) for each wake dot’s target—ribbon thickness and sparkle spread.",
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "wakeSpringStiffness",
    label: "Wake spring",
    description:
      "How tightly wake dots chase their moving targets on the path each frame.",
    min: 0.01,
    max: 0.42,
    step: 0.005,
  },
  {
    key: "wakeFriction",
    label: "Wake friction",
    description:
      "Per-frame velocity damping for wake dots only (separate from main logo particle friction).",
    min: 0.85,
    max: 0.995,
    step: 0.002,
  },
  {
    key: "wakeAlongDrag",
    label: "Wake along drag",
    description:
      "Extra velocity boost along the local path tangent so wake particles drift forward with the stroke motion.",
    min: 0,
    max: 6,
    step: 0.02,
  },
  {
    key: "wakeAlphaMult",
    label: "Wake alpha mult",
    description:
      "Scales wake dot opacity (on top of length / point-count fades). Lower = subtler ribbon.",
    min: 0.2,
    max: 1,
    step: 0.01,
  },
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

function clampTuningToSliders(t: ViscousCoffeeLiveTuning): ViscousCoffeeLiveTuning {
  let next = mergeViscousCoffeeLiveTuning(t)
  for (const spec of SLIDERS) {
    const v = next[spec.key]
    const clamped = Math.min(spec.max, Math.max(spec.min, v))
    next = { ...next, [spec.key]: clamped }
  }
  return next
}

export function ParticleLogoViscousTuningSection() {
  const [tuning, setTuning] = useState<ViscousCoffeeLiveTuning>(() =>
    loadTuning()
  )
  const restorePointRef = useRef<ViscousCoffeeLiveTuning | null>(null)

  useLayoutEffect(() => {
    restorePointRef.current = mergeViscousCoffeeLiveTuning(tuning)
  }, [])

  const saveSettings = useCallback(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(tuning))
    } catch {
      /* ignore quota */
    }
  }, [tuning])

  const updateRestorePoint = useCallback(() => {
    restorePointRef.current = mergeViscousCoffeeLiveTuning(tuning)
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
        Viscous coffee (trail, shear, slow fill-in) —{" "}
        <code className="rounded bg-white/10 px-1 text-xs">HomeParticleLogoHero</code>{" "}
        lab mode (home uses the default interaction; sliders only apply here)
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
            Sliders update physics immediately. Wake particle count triggers a short
            rebuild. Use <strong className="font-medium text-white/70">Save settings</strong>{" "}
            to write the current sliders to{" "}
            <code className="rounded bg-white/10 px-1">localStorage</code> (reload
            keeps them). Saving does not reset the animation.{" "}
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
