"use client"

import React from "react"
import { UV_STATUS_MESSAGE } from "../../lib/methods/uv"

const UvPlaceholder: React.FC = () => (
  <div className="rounded-md border border-dashed border-ui-border-base bg-ui-bg-subtle p-4 text-sm text-ui-fg-subtle">
    <p className="text-ui-fg-base font-medium">UV printing</p>
    <p className="mt-1">{UV_STATUS_MESSAGE}</p>
    <p className="mt-2 text-xs">
      Email <a className="underline" href="mailto:info@scprints.com.au">info@scprints.com.au</a>{" "}
      with your artwork and substrate and we'll come back with a quote.
    </p>
  </div>
)

export default UvPlaceholder
