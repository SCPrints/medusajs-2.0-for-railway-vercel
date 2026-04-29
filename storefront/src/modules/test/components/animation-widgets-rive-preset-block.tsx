"use client"

import { useRive } from "@rive-app/react-canvas"
import type { RiveLabPreset } from "@modules/test/animation-lab-rive-presets"
import { resolveRivePresetSrc } from "@modules/test/animation-lab-rive-presets"

type Props = {
  preset: RiveLabPreset
  /** 1-based index for NEXT_PUBLIC_ANIMATION_LAB_RIVE_N */
  envIndex: number
  reducedMotion: boolean
}

export default function AnimationWidgetsRivePresetBlock({ preset, envIndex, reducedMotion }: Props) {
  const src = resolveRivePresetSrc(envIndex, preset.src)

  const { RiveComponent } = useRive(
    {
      src,
      autoplay: !reducedMotion,
      stateMachines: preset.stateMachines,
      animations: preset.animations,
      shouldDisableRiveListeners: preset.shouldDisableRiveListeners ?? true,
    },
    /**
     * Default IO pauses the runtime when the canvas rect is "not visible" — combined with flex layout
     * that can briefly be 0×0, labs often stayed blank. This page is test-only.
     */
    { shouldUseIntersectionObserver: false }
  )

  return (
    <div className="flex h-[220px] w-full flex-col rounded-xl border border-ui-border-base bg-ui-bg-subtle">
      {/**
       * Do not pass `className` to RiveComponent: @rive-app/react-canvas only applies default
       * width/height 100% on the container div when className is omitted (see RiveComponent in dist).
       */}
      <div className="min-h-0 flex-1">
        <RiveComponent style={{ width: "100%", height: "100%", display: "block" }} />
      </div>
      <p className="border-t border-ui-border-base p-2 text-center text-[11px] text-ui-fg-muted">
        Source: <code className="text-ui-fg-base">{src}</code> — optional env{" "}
        <code className="text-ui-fg-base">NEXT_PUBLIC_ANIMATION_LAB_RIVE_{envIndex}</code>
      </p>
    </div>
  )
}
