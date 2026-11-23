"use client"

import { unlockTeamStore } from "@lib/data/team-stores"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function PasswordGate({ handle, title, wrong }: { handle: string; title: string; wrong: boolean }) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(wrong ? "That password isn't right." : null)
  const [busy, setBusy] = useState(false)

  return (
    <form
      className="mx-auto flex max-w-sm flex-col gap-3 py-16"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const r = await unlockTeamStore(handle, password)
        setBusy(false)
        if (!r.ok) return setError(r.error ?? "Try again.")
        router.refresh()
      }}
    >
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-ui-fg-subtle">This store needs a password. Your club will have sent it with the link.</p>
      <input
        type="password"
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="min-h-11 rounded-md border px-3"
        aria-label="Store password"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" disabled={busy || !password} className="min-h-11 rounded-md bg-(--brand-primary) px-4 font-semibold text-white disabled:opacity-50">
        {busy ? "Checking…" : "Open the store"}
      </button>
    </form>
  )
}
