"use client"

import { useEffect, useState, type ComponentType } from "react"

type IdleCallbackHandle = number

type WindowWithIdle = Window & {
  requestIdleCallback?: (
    cb: () => void,
    opts?: { timeout?: number }
  ) => IdleCallbackHandle
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void
}

export default function ChatWidgetLazy() {
  const [Component, setComponent] = useState<ComponentType | null>(null)

  useEffect(() => {
    const w = window as WindowWithIdle
    let idleHandle: IdleCallbackHandle | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const load = () => {
      if (cancelled) return
      import("./chat-widget").then((mod) => {
        if (!cancelled) setComponent(() => mod.default)
      })
    }

    if (typeof w.requestIdleCallback === "function") {
      idleHandle = w.requestIdleCallback(load, { timeout: 4000 })
    } else {
      timeoutHandle = setTimeout(load, 2000)
    }

    return () => {
      cancelled = true
      if (idleHandle !== null && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleHandle)
      }
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle)
      }
    }
  }, [])

  if (!Component) return null
  return <Component />
}
