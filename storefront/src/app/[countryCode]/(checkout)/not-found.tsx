import InteractiveLink from "@modules/common/components/interactive-link"
import NotFoundTetrisSection from "@modules/common/components/not-found-tetris-section"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "404",
  description: "Something went wrong",
}

export default async function NotFound() {
  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)] px-4 pb-10">
      <h1 className="text-2xl-semi text-ui-fg-base text-center max-w-lg">
        Page not found&hellip; But maybe you&rsquo;ve found something else
      </h1>
      <p className="text-small-regular text-ui-fg-base text-center">
        The page you tried to access does not exist.
      </p>
      <InteractiveLink href="/">Go to frontpage</InteractiveLink>
      <NotFoundTetrisSection />
    </div>
  )
}
