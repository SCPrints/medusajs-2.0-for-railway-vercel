/**
 * Start an admin supplier import and wait for its result (review 2-8).
 * POST answers 202 with `started_at`; the import runs off the request and
 * GET on the same URL reports `{ in_progress, last_run }`. Resolves with
 * the run's result once `last_run.started_at` matches ours.
 */
const POLL_MS = 2000
const DEADLINE_MS = 60 * 60 * 1000

type RunState<T> = {
  in_progress: boolean
  last_run: { started_at: string; result: T | null; error: string | null } | null
}

export async function runSupplierImport<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const started = (await res.json().catch(() => ({}))) as { error?: string; started_at?: string }
  if (!res.ok) throw new Error(started.error ?? `HTTP ${res.status}`)

  const deadline = Date.now() + DEADLINE_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    const poll = await fetch(url, { credentials: "include" })
    if (!poll.ok) continue
    const state = (await poll.json()) as RunState<T>
    const run = state.last_run
    if (!state.in_progress && run && run.started_at === started.started_at) {
      if (run.error) throw new Error(run.error)
      return run.result as T
    }
  }
  throw new Error("Import is still running on the server — check back in a few minutes.")
}
