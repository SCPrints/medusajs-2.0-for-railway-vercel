import { useState } from "react"
import { useFormState } from "react-dom"
import { useRouter } from "next/navigation"

import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import Input from "@modules/common/components/input"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { login } from "@lib/data/customer"
import { completeTwoStepLogin } from "@lib/data/identity"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

/** Second sign-in step, shown only when the account has two-step login on. */
const CodeStep = ({ mfa }: { mfa: { challengeId: string; token: string } }) => {
  const router = useRouter()
  const [useBackup, setUseBackup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="max-w-sm w-full flex flex-col items-center" data-testid="two-step-page">
      <h1 className="text-large-semi uppercase mb-6">Enter your code</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        {useBackup ? "Enter one of your backup codes." : "Open your authenticator app and enter the 6-digit code."}
      </p>
      <form
        className="w-full"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          const code = String(new FormData(e.currentTarget).get("code") ?? "")
          const r = await completeTwoStepLogin({ ...mfa, code, method: useBackup ? "recovery_code" : "totp" })
          setBusy(false)
          if (r.ok) router.refresh()
          else setError(r.error)
        }}
      >
        <Input label={useBackup ? "Backup code" : "Code"} name="code" autoComplete="one-time-code" inputMode={useBackup ? "text" : "numeric"} required data-testid="two-step-code-input" />
        <ErrorMessage error={error} />
        <button type="submit" disabled={busy} className="mt-6 min-h-11 w-full rounded-md bg-ui-button-inverted px-4 text-ui-fg-on-inverted disabled:opacity-60" data-testid="two-step-submit">
          {busy ? "Checking..." : "Sign in"}
        </button>
      </form>
      <button type="button" onClick={() => setUseBackup(!useBackup)} className="mt-6 min-h-11 underline text-small-regular">
        {useBackup ? "Use my authenticator app" : "Use a backup code"}
      </button>
    </div>
  )
}

const Login = ({ setCurrentView }: Props) => {
  const [message, formAction] = useFormState(login, null)
  if (message && typeof message === "object" && "mfa" in message) return <CodeStep mfa={message.mfa} />

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="login-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Welcome back</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Sign in to access an enhanced shopping experience.
      </p>
      <form className="w-full" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Email"
            name="email"
            type="email"
            title="Enter a valid email address."
            autoComplete="email"
            required
            data-testid="email-input"
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="password-input"
          />
        </div>
        <ErrorMessage error={typeof message === "string" ? message : null} data-testid="login-error-message" />
        <SubmitButton data-testid="sign-in-button" className="w-full mt-6">
          Sign in
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Not a member?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className="underline"
          data-testid="register-button"
        >
          Join us
        </button>
        .
      </span>
    </div>
  )
}

export default Login
