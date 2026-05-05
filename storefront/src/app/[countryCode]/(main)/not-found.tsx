import { Metadata } from "next"

import InteractiveLink from "@modules/common/components/interactive-link"
import NotFoundTetrisSection from "@modules/common/components/not-found-tetris-section"

import NotFoundBodyBg from "./not-found-body-bg"

export const metadata: Metadata = {
  title: "404",
  description: "Something went wrong",
}

/** Header colour — same value `bg-ui-fg-base` resolves to (`--brand-primary` /
 * Inkwell Navy from `globals.css`). Inlined as a hex literal so this page is
 * not at the mercy of Tailwind class generation, CSS load order, or globals
 * cascade — the browser renders the colour we ask for. */
const HEADER_NAVY = "#1a1a2e"

export default function NotFound() {
  return (
    <>
      {/** Forces document body + html bg to navy via JS-applied inline styles
       * with `!important`. Bypasses the CSS cascade entirely so it can't lose
       * to globals.css `--brand-background`. */}
      <NotFoundBodyBg />
      {/** Fixed full-viewport backdrop (belt-and-braces) covering the whole
       * page at the lowest layer. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ backgroundColor: HEADER_NAVY }}
      />
      <div
        className="-mx-[calc(50vw-50%)] flex w-screen flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)] px-4 pb-10 pt-10 text-white"
        style={{ backgroundColor: HEADER_NAVY }}
      >
        <h1 className="text-2xl-semi text-white text-center max-w-lg">
          Page not found&hellip; But maybe you&rsquo;ve found something else
        </h1>
        <p className="text-small-regular text-white/80 text-center">
          The page you tried to access does not exist.
        </p>
        <InteractiveLink href="/">Go to frontpage</InteractiveLink>
        <NotFoundTetrisSection />
      </div>
    </>
  )
}
