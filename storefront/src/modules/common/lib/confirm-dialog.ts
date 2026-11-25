/**
 * An on-page "Are you sure?" box, in place of window.confirm(). In-app
 * browsers (Facebook, Instagram, some work browsers) block confirm() and it
 * returns false at once, so Remove / Delete buttons silently did nothing.
 * Escape, Cancel or a click outside answers no. Client-side only.
 */
export function confirmDialog(message: string, confirmLabel = "Yes"): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false)
  return new Promise((resolve) => {
    const before = document.activeElement as HTMLElement | null
    const overlay = document.createElement("div")
    overlay.className = "fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"

    const box = document.createElement("div")
    box.setAttribute("role", "alertdialog")
    box.setAttribute("aria-modal", "true")
    box.setAttribute("aria-labelledby", "confirm-dialog-message")
    box.className = "w-full max-w-sm rounded-2xl bg-white p-5 shadow-lg"

    const text = document.createElement("p")
    text.id = "confirm-dialog-message"
    text.className = "text-base text-ui-fg-base"
    text.textContent = message

    const row = document.createElement("div")
    row.className = "mt-5 flex justify-end gap-2"
    const cancel = document.createElement("button")
    cancel.type = "button"
    cancel.textContent = "Cancel"
    cancel.className =
      "min-h-11 rounded-full px-4 text-sm font-semibold text-ui-fg-base ring-1 ring-ui-border-base hover:bg-ui-bg-subtle"
    const ok = document.createElement("button")
    ok.type = "button"
    ok.textContent = confirmLabel
    ok.className = "min-h-11 rounded-full bg-ink px-4 text-sm font-semibold text-white hover:brightness-110"

    const done = (answer: boolean) => {
      document.removeEventListener("keydown", onKey, true)
      overlay.remove()
      before?.focus?.()
      resolve(answer)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        done(false)
      } else if (e.key === "Tab") {
        // Keep focus on the two buttons.
        e.preventDefault()
        ;(document.activeElement === ok ? cancel : ok).focus()
      }
    }
    cancel.addEventListener("click", () => done(false))
    ok.addEventListener("click", () => done(true))
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) done(false)
    })
    document.addEventListener("keydown", onKey, true)

    row.append(cancel, ok)
    box.append(text, row)
    overlay.append(box)
    document.body.append(overlay)
    ok.focus()
  })
}
