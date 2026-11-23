"use client"

import { approveTeamStore } from "@lib/data/team-stores"
import { useState } from "react"

export default function ApproveForm({ handle, sig }: { handle: string; sig: string }) {
  const [name, setName] = useState("")
  const [state, setState] = useState<{ done?: boolean; error?: string; busy?: boolean }>({})
  if (state.done) return <p className="rounded-md bg-green-50 p-4 text-green-800">Thanks — the store is approved. We'll open it and send you the link.</p>
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setState({ busy: true })
        const r = await approveTeamStore(handle, sig, name)
        setState(r.ok ? { done: true } : { error: r.error })
      }}
    >
      <p className="text-sm">If every item looks right, type your name and approve. To change anything, reply to our email instead.</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="min-h-11 rounded-md border px-3" aria-label="Your name" />
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={state.busy || name.trim().length < 2} className="min-h-11 rounded-md bg-(--brand-primary) px-4 font-semibold text-white disabled:opacity-50">
        Approve the store
      </button>
    </form>
  )
}
