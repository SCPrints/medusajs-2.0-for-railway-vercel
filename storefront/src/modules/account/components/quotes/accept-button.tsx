"use client"

import { useFormStatus } from "react-dom"

/** Submit button for the "Accept quote" form — shows it is working, blocks a double click. */
const AcceptButton = ({ label = "Accept quote" }: { label?: string }) => {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      data-testid="quote-accept-button"
    >
      {pending ? "Opening…" : label}
    </button>
  )
}

export default AcceptButton
