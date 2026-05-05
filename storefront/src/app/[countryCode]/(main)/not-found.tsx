import { Metadata } from "next"

import InteractiveLink from "@modules/common/components/interactive-link"
import NotFoundTetrisSection from "@modules/common/components/not-found-tetris-section"

export const metadata: Metadata = {
  title: "404",
  description: "Something went wrong",
}

export default function NotFound() {
  return (
    <>
      {/** Override the document body's default light bg with the same navy
       * (--brand-primary, i.e. bg-ui-fg-base) used by the header — so the entire
       * page reads as one continuous dark surface from header to footer. The
       * style tag is removed automatically when navigating away from the 404. */}
      <style>{`
        body { background-color: var(--brand-primary) !important; }
      `}</style>
      <div className="-mx-[calc(50vw-50%)] flex w-screen flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)] bg-ui-fg-base px-4 pb-10 pt-10 text-white">
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
