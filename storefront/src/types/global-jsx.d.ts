/**
 * React 19's types dropped the global `JSX` namespace (it's `React.JSX` now).
 * Some of our files and a few older libraries (react-snowfall, Rive) still
 * write `JSX.Element`. Until Next 16.4 that resolved through React 18 types a
 * transitive dependency dragged in (later it fell through to an empty interface
 * in Algolia's typings, since removed). This points the global name at React's.
 */
import type { JSX as ReactJSX } from "react"

declare global {
  namespace JSX {
    // Empty on purpose: these merge into React's JSX types.
    /* eslint-disable @typescript-eslint/no-empty-object-type */
    interface Element extends ReactJSX.Element {}
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
    /* eslint-enable @typescript-eslint/no-empty-object-type */
  }
}

export {}
