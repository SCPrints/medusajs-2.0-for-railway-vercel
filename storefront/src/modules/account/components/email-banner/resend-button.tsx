"use client"

import { useState } from "react"

import { resendEmailConfirmation } from "@lib/data/identity"

export default function ResendButton() {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button
        type="button"
        disabled={busy}
        className="min-h-11 underline disabled:opacity-60"
        onClick={async () => {
          setBusy(true)
          const r = await resendEmailConfirmation()
          setBusy(false)
          setMsg(r.ok ? "Sent. Check your inbox." : r.error)
        }}
      >
        Send it again
      </button>
      {msg && <span className="ml-2">{msg}</span>}
    </>
  )
}
