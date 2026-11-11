import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Heading, Text, Textarea } from "@medusajs/ui"
import { toJpeg } from "html-to-image"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

/**
 * "Suggestion" pill pinned to the top of every admin page. Click → snapshot
 * of the admin page (rendered from the DOM, so only this browser tab, no
 * share-screen prompt) → small window to type the idea → POST
 * /admin/suggestions, which emails it with the screenshot.
 *
 * ponytail: Medusa has no "every page" widget zone, but every widget file is
 * imported when the admin boots, so this file mounts its own React root on
 * <body> as a side effect. The widget export itself renders nothing.
 */

const ROOT_ID = "scp-suggestion-root"
const HIDDEN_PATHS = /\/(login|reset-password|invite)/

const capture = async (root: HTMLElement): Promise<string | null> => {
  try {
    return await toJpeg(document.body, {
      quality: 0.8,
      pixelRatio: 1,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#fff",
      filter: (node) => node !== root,
      // Images that can't be fetched (CORS) become blank, not a failed shot.
      imagePlaceholder:
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    })
  } catch (err) {
    console.error("Suggestion screenshot failed", err)
    return null
  }
}

const SuggestionButton = ({ root }: { root: HTMLElement }) => {
  const [path, setPath] = useState(window.location.pathname)
  const [stage, setStage] = useState<"idle" | "capturing" | "open" | "sending" | "sent">("idle")
  const [shot, setShot] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Lives outside the router, so poll the path (cheap) to hide on login.
  useEffect(() => {
    const t = window.setInterval(() => setPath(window.location.pathname), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (stage !== "open") return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setStage("idle")
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [stage])

  if (HIDDEN_PATHS.test(path)) return null

  const start = async () => {
    setStage("capturing")
    setError(null)
    setMessage("")
    setShot(await capture(root))
    setStage("open")
  }

  const send = async () => {
    setStage("sending")
    setError(null)
    try {
      const r = await fetch("/admin/suggestions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          page_url: window.location.href,
          page_title: document.title,
          screenshot: shot,
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        throw new Error(j?.error || j?.message || `Couldn't send (${r.status})`)
      }
      setStage("sent")
      window.setTimeout(() => setStage((s) => (s === "sent" ? "idle" : s)), 2500)
    } catch (err: any) {
      setError(err?.message ?? "Couldn't send")
      setStage("open")
    }
  }

  const modalOpen = stage === "open" || stage === "sending"

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={stage !== "idle"}
        className="fixed left-1/2 top-2 z-[60] -translate-x-1/2 rounded-full border border-ui-border-base bg-ui-bg-base px-3 py-1 text-xs font-medium text-ui-fg-base shadow-elevation-card-rest hover:bg-ui-bg-base-hover disabled:opacity-70"
      >
        {stage === "capturing" ? "Taking screenshot…" : stage === "sent" ? "Thanks — sent ✓" : "💡 Suggestion"}
      </button>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && stage === "open" && setStage("idle")}
        >
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-lg bg-ui-bg-base p-5 shadow-elevation-modal">
            <Heading level="h2">Suggest an improvement</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              What would make this page better? A screenshot of this page is attached.
            </Text>
            <Textarea
              autoFocus
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. It would help if this list showed the due date…"
            />
            {shot ? (
              <img src={shot} alt="Screenshot of this page" className="max-h-48 w-full rounded border border-ui-border-base object-contain object-top" />
            ) : (
              <Text size="small" className="text-ui-fg-muted">Couldn't take a screenshot — the page address is still sent.</Text>
            )}
            {error ? <Text size="small" className="text-ui-fg-error">{error}</Text> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="small" onClick={() => setStage("idle")} disabled={stage === "sending"}>
                Cancel
              </Button>
              <Button size="small" onClick={send} isLoading={stage === "sending"} disabled={!message.trim()}>
                Send suggestion
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

// Module-level code runs during admin boot: never let it throw, or the whole
// admin fails to load.
try {
  if (typeof document !== "undefined" && !document.getElementById(ROOT_ID)) {
    const el = document.createElement("div")
    el.id = ROOT_ID
    document.body.appendChild(el)
    createRoot(el).render(<SuggestionButton root={el} />)
  }
} catch (err) {
  console.error("Suggestion button failed to mount", err)
}

const SuggestionButtonWidget = () => null

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default SuggestionButtonWidget
