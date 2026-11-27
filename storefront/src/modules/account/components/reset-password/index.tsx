"use client"

import { useEffect } from "react"
import { useFormState } from "react-dom"

import { requestPasswordReset, resetPassword } from "@lib/data/customer"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type Props = { token?: string; email?: string }

const errorOf = (state: unknown) =>
  state && typeof state === "object" && "error" in state ? String((state as { error: unknown }).error) : null

/**
 * One page, two jobs. Without a token: ask for the email and send the link.
 * With the token from that email: choose the new password.
 */
export default function ResetPassword({ token, email }: Props) {
  const [asked, askAction] = useFormState(requestPasswordReset, null)
  const [changed, changeAction] = useFormState(resetPassword, null)

  // The link's token is one use: take it out of the address bar (and so out of
  // browser history and analytics) once this page holds it.
  useEffect(() => {
    if (token) window.history.replaceState(window.history.state, "", window.location.pathname)
  }, [token])

  const shell = (title: string, children: React.ReactNode) => (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center" data-testid="reset-password-page">
      <h1 className="text-large-semi uppercase mb-6">{title}</h1>
      {children}
    </div>
  )

  if (changed && "done" in changed) {
    return shell(
      "Password changed",
      <>
        <p className="text-center text-base-regular text-ui-fg-base mb-6" data-testid="reset-password-done">
          Your new password is saved. Sign in with it now.
        </p>
        <LocalizedClientLink href="/account" className="underline min-h-11 inline-flex items-center">
          Sign in
        </LocalizedClientLink>
      </>
    )
  }

  if (token && email) {
    return shell(
      "Choose a new password",
      <form className="w-full" action={changeAction}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={email} />
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            data-testid="new-password-input"
          />
          <Input
            label="Type it again"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            data-testid="confirm-password-input"
          />
        </div>
        <p className="mt-2 text-small-regular text-ui-fg-subtle">At least 8 characters.</p>
        <ErrorMessage error={errorOf(changed)} data-testid="reset-password-error" />
        {errorOf(changed) ? (
          <LocalizedClientLink href="/reset-password" className="mt-2 inline-flex min-h-11 items-center underline">
            Send me a new link
          </LocalizedClientLink>
        ) : null}
        <SubmitButton data-testid="reset-password-submit" className="w-full mt-6">
          Save new password
        </SubmitButton>
      </form>
    )
  }

  if (asked && "sent" in asked) {
    return shell(
      "Check your email",
      <p className="text-center text-base-regular text-ui-fg-base" data-testid="reset-password-sent">
        If that email has an account with us, we&apos;ve sent it a link to choose a new password. The link lasts 15
        minutes. If it doesn&apos;t arrive, check your junk folder.
      </p>
    )
  }

  return shell(
    "Forgot your password?",
    <>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Enter the email you sign in with and we&apos;ll send you a link to choose a new password.
      </p>
      <form className="w-full" action={askAction}>
        <Input label="Email" name="email" type="email" autoComplete="email" required data-testid="reset-email-input" />
        <ErrorMessage error={errorOf(asked)} data-testid="reset-password-error" />
        <SubmitButton data-testid="reset-password-request" className="w-full mt-6">
          Email me a link
        </SubmitButton>
      </form>
      <LocalizedClientLink href="/account" className="mt-4 inline-flex min-h-11 items-center underline">
        Back to sign in
      </LocalizedClientLink>
    </>
  )
}
