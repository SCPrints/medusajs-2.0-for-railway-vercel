"use client"

import { useState } from "react"

import { confirmTwoStep, startTwoStep, turnOffTwoStep } from "@lib/data/identity"

type Props = { email: string; initial: { enabled: boolean; factorId: string | null } }
type Setup = { factorId: string; secret: string; url: string }

const btn = "min-h-11 rounded-md border border-ui-border-base px-4 text-small-regular disabled:opacity-60"

/** Two-step login with an authenticator app. Off unless the customer turns it on. */
export default function ProfileTwoStep({ email, initial }: Props) {
  const [state, setState] = useState(initial)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const begin = async () => {
    setBusy(true)
    setError(null)
    const r = await startTwoStep(email)
    setBusy(false)
    if (r.ok) setSetup(r)
    else setError(r.error)
  }
  const confirm = async (code: string) => {
    if (!setup) return
    setBusy(true)
    setError(null)
    const r = await confirmTwoStep(setup.factorId, code)
    setBusy(false)
    if (r.ok) {
      setCodes(r.recoveryCodes)
      setState({ enabled: true, factorId: setup.factorId })
      setSetup(null)
    } else setError(r.error)
  }
  const turnOff = async () => {
    if (!state.factorId || !window.confirm("Turn off two-step login?")) return
    setBusy(true)
    const r = await turnOffTwoStep(state.factorId)
    setBusy(false)
    if (r.ok) setState({ enabled: false, factorId: null })
    else setError(r.error)
  }

  return (
    <div className="w-full" data-testid="account-two-step">
      <p className="text-base-semi">Two-step login</p>
      <p className="mt-1 text-small-regular text-ui-fg-subtle">
        {state.enabled
          ? "On. You'll enter a code from your authenticator app each time you sign in."
          : "Off. Turn it on to ask for a code from an authenticator app when you sign in."}
      </p>

      {codes && (
        <div className="mt-4 rounded-md border border-ui-border-base p-4">
          <p className="text-small-semi">Save these backup codes now. Each works once, and we won't show them again.</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-small-regular">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button type="button" className={`${btn} mt-3`} onClick={() => setCodes(null)}>
            I've saved them
          </button>
        </div>
      )}

      {setup && (
        <form
          className="mt-4 flex flex-col gap-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            confirm(String(new FormData(e.currentTarget).get("code") ?? ""))
          }}
        >
          <p className="text-small-regular">
            1. Add this to your authenticator app. On a phone,{" "}
            <a className="underline" href={setup.url}>
              tap here to open it
            </a>
            , or type this key in: <span className="font-mono break-all">{setup.secret}</span>
          </p>
          <label className="text-small-regular" htmlFor="two-step-code">
            2. Enter the 6-digit code it shows
          </label>
          <input id="two-step-code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="min-h-11 w-48 rounded-md border border-ui-border-base px-3" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={btn}>
              {busy ? "Checking..." : "Turn on"}
            </button>
            <button type="button" className={btn} onClick={() => setSetup(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-2 text-small-regular text-rose-600">{error}</p>}

      {!setup && (
        <div className="mt-4">
          {state.enabled ? (
            <button type="button" disabled={busy} className={btn} onClick={turnOff}>
              Turn off
            </button>
          ) : (
            <button type="button" disabled={busy} className={btn} onClick={begin}>
              Set up
            </button>
          )}
        </div>
      )}
    </div>
  )
}
