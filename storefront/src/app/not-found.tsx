import { ArrowUpRightMini } from "@medusajs/icons"
import { Text } from "@medusajs/ui"
import { Metadata } from "next"
import Link from "next/link"

import NotFoundTetrisSection from "@modules/common/components/not-found-tetris-section"
import MainStoreShell from "@modules/layout/templates/main-store-shell"

export const metadata: Metadata = {
  title: "404",
  description: "Something went wrong",
}

export default function NotFound() {
  return (
    <MainStoreShell>
      <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)] px-4 pb-10">
        <h1 className="text-2xl-semi text-ui-fg-base text-center max-w-lg">
          Page not found&hellip; But maybe you&rsquo;ve found something else
        </h1>
        <p className="text-small-regular text-ui-fg-base text-center">
          The page you tried to access does not exist.
        </p>
        <Link
          className="flex gap-x-1 items-center group"
          href="/"
        >
          <Text className="text-ui-fg-interactive">Go to frontpage</Text>
          <ArrowUpRightMini
            className="group-hover:rotate-45 ease-in-out duration-150"
            color="var(--fg-interactive)"
          />
        </Link>
        <NotFoundTetrisSection />
      </div>
    </MainStoreShell>
  )
}
