function formatApiErrorMessage(data: unknown): string {
  if (typeof data === "string") {
    return data
  }
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>
    const msg = record.message
    if (typeof msg === "string") {
      return msg
    }
    if (msg && typeof msg === "object") {
      const nested = formatApiErrorMessage(msg)
      if (nested && nested !== "{}") {
        return nested
      }
    }
    if (Array.isArray(msg)) {
      return msg.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(", ")
    }
    const errors = record.errors
    if (Array.isArray(errors)) {
      return errors.map((e) => formatApiErrorMessage(e)).join(", ")
    }
  }
  try {
    return JSON.stringify(data)
  } catch {
    return "Request failed"
  }
}

function isSdkFetchError(error: unknown): error is Error & { status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number" &&
    typeof (error as { message?: unknown }).message === "string"
  )
}

export default function medusaError(error: any): never {
  // @medusajs/js-sdk throws FetchError on HTTP errors (message from API) — not axios-shaped
  if (isSdkFetchError(error) && error.status >= 400) {
    const message = formatApiErrorMessage(error.message)
    const normalized = (message.trim() || "Request failed") as string
    const withPeriod = /[.!?]$/.test(normalized) ? normalized : `${normalized}.`
    throw new Error(withPeriod.charAt(0).toUpperCase() + withPeriod.slice(1))
  }

  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const u = new URL(error.config.url, error.config.baseURL)
    console.error("Resource:", u.toString())
    console.error("Response data:", error.response.data)
    console.error("Status code:", error.response.status)
    console.error("Headers:", error.response.headers)

    const raw = error.response.data?.message ?? error.response.data
    const message = formatApiErrorMessage(raw)
    const normalized = (message.trim() || "Request failed") as string
    const withPeriod = /[.!?]$/.test(normalized) ? normalized : `${normalized}.`

    throw new Error(withPeriod.charAt(0).toUpperCase() + withPeriod.slice(1))
  } else if (error.request) {
    // The request was made but no response was received
    throw new Error("No response received: " + error.request)
  } else {
    // Something happened in setting up the request that triggered an Error
    throw new Error("Error setting up the request: " + error.message)
  }
}
