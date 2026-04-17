"use client"

import { useState } from "react"

export default function ContactForm() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const data = {
      first_name: formData.get("first-name"),
      last_name: formData.get("last-name"),
      email: formData.get("email"),
      subject: formData.get("subject"),
      message: formData.get("message"),
    }

    try {
      // ✅ Send to general backend API (NOT Store API)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL}/api/contact`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      )

      if (response.ok) {
        setSuccess(true)
      } else {
        alert("Backend received the request, but rejected it. Check Railway logs.")
      }
    } catch (err) {
      console.error(err)
      alert("Failed to connect to the backend. Please check your network or URL.")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-12 bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex justify-center mb-6">
          <svg
            className="w-16 h-16 text-gray-900"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Message Received!</h2>
        <p className="mt-2 text-gray-500">We'll be in touch shortly.</p>
        <button
          onClick={() => setSuccess(false)}
          className="mt-6 text-sm font-semibold text-gray-900 underline"
        >
          Send another message
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* form unchanged */}
      </form>
    </div>
  )
}