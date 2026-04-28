"use client"

import { useRive } from "@rive-app/react-canvas"

/** Public community file — override with NEXT_PUBLIC_ANIMATION_LAB_RIVE_SRC if needed. */
const DEFAULT_RIVE_SRC =
  "https://public.rive.app/community/runtime-files/1486-2764-tiger-demo.riv"

type Props = {
  reducedMotion: boolean
}

export default function AnimationWidgetsRiveBlock({ reducedMotion }: Props) {
  const src = process.env.NEXT_PUBLIC_ANIMATION_LAB_RIVE_SRC ?? DEFAULT_RIVE_SRC

  const { RiveComponent } = useRive({
    src,
    autoplay: !reducedMotion,
  })

  return (
    <div className="flex h-[220px] w-full flex-col rounded-xl border border-ui-border-base bg-ui-bg-subtle">
      <RiveComponent className="h-full w-full flex-1" />
      <p className="border-t border-ui-border-base p-2 text-center text-[11px] text-ui-fg-muted">
        Rive runtime — set <code className="text-ui-fg-base">NEXT_PUBLIC_ANIMATION_LAB_RIVE_SRC</code> for your
        file.
      </p>
    </div>
  )
}
