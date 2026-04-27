"use client"

import MiniTetris from "@modules/common/components/mini-tetris"

/**
 * Client island: 404 pages are server components; this keeps Tetris in one place for every not-found route.
 */
export default function NotFoundTetrisSection() {
  return (
    <div className="w-full max-w-2xl mt-6 small:mt-10 flex flex-col items-stretch px-0">
      <p className="text-sm text-ui-fg-muted text-center mb-3">
        While you&rsquo;re here, you can play a quick round of Tetris.
      </p>
      <div className="flex justify-center w-full">
        <MiniTetris />
      </div>
    </div>
  )
}
