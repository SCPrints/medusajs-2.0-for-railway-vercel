"use client"

import { FormEvent, useState } from "react"

export default function NewsletterSignup() {
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setIsSubmitting(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })

      const body = await response.json().catch(() => null)

      if (!response.ok) {
        setError(body?.message ?? "Subscription failed. Please try again.")
        return
      }

      setMessage(body?.message ?? "Thanks for subscribing!")
      setEmail("")
    } catch (submitError) {
      console.error(submitError)
      setError("Subscription failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle p-3">
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-md border border-ui-border-base bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ui-fg-base"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 w-full rounded-md bg-ui-fg-base px-3 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "Subscribing..." : "Subscribe"}
      </button>
      {message && <p className="mt-2 text-xs text-green-700">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  )
}
