import { afterPageLoad } from "./after-page-load"

/**
 * framer-motion's animation code (~50 KB gzipped) loads after the page, not
 * before the first product photo. Components render `m.*` inside
 * `<LazyMotion features={loadMotionFeatures}>`: they show their resting state
 * until it arrives, then animate exactly as `motion.*` did.
 */
let loaded = false
let features: Promise<typeof import("./motion-features").default> | undefined

export const loadMotionFeatures = () =>
  (features ??= new Promise((resolve, reject) =>
    afterPageLoad(() =>
      import("./motion-features").then((m) => {
        loaded = true
        resolve(m.default)
      }, reject)
    )
  ))

/** True once the animation code has arrived; before that `m.*` won't animate. */
export const motionFeaturesLoaded = () => loaded
