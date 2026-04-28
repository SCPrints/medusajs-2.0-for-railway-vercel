"use client"

import Lottie, { type LottieRefCurrentProps } from "lottie-react"
import { useEffect, useRef, useState } from "react"
import { useInView } from "react-intersection-observer"

/** Public JSON (LottieFiles-style); replace if this asset is ever removed. */
const LOTTIE_JSON_URL =
  "https://assets2.lottiefiles.com/packages/lf20_aZTdD5.json"

type Props = {
  reducedMotion: boolean
}

export default function AnimationWidgetsLottieBlock({ reducedMotion }: Props) {
  const { ref, inView } = useInView({ threshold: 0.35, triggerOnce: false })
  const lottieRef = useRef<LottieRefCurrentProps>(null)
  const [data, setData] = useState<object | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(LOTTIE_JSON_URL)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setData(json)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const api = lottieRef.current
    if (!api || !data) {
      return
    }
    if (reducedMotion) {
      api.pause()
      api.goToAndStop(0, true)
      return
    }
    if (inView) {
      api.play()
    } else {
      api.pause()
    }
  }, [inView, reducedMotion, data])

  if (!data) {
    return (
      <div ref={ref} className="mx-auto flex min-h-[200px] max-w-xs items-center justify-center">
        <div className="h-40 w-40 animate-pulse rounded-2xl bg-ui-bg-base" />
      </div>
    )
  }

  return (
    <div ref={ref} className="mx-auto max-w-xs">
      <Lottie
        lottieRef={lottieRef}
        animationData={data}
        loop={!reducedMotion}
        autoplay={false}
        className="max-h-[220px]"
      />
      <p className="mt-2 text-center text-xs text-ui-fg-muted">
        Plays while this block is in view (paused when reduced motion is on).
      </p>
    </div>
  )
}
