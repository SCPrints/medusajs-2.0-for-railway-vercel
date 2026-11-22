/** Run `task` once the page has loaded and the main thread is idle. Returns a cancel. */
export const afterPageLoad = (task: () => void) => {
  let cancelled = false
  const run = () => {
    if (!cancelled) task()
  }
  const schedule = () => {
    // Safari has no requestIdleCallback.
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 4000 })
    else setTimeout(run, 1500)
  }
  if (document.readyState === "complete") schedule()
  else window.addEventListener("load", schedule, { once: true })
  return () => {
    cancelled = true
    window.removeEventListener("load", schedule)
  }
}
