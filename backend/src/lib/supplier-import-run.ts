import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { isLockSkipped, withSupplierLock } from "./supplier-sync-lock"

/**
 * Admin supplier imports run off the request (review 2-8).
 *
 * The AS Colour / FashionBiz import routes used to do the whole import
 * inside one HTTP request — minutes of supplier API calls → proxy timeout →
 * staff retry → a second concurrent run. Same shape as
 * products-manager/image-audit: POST takes the supplier lock (fails fast,
 * 409 if held), answers 202 with `started_at`, and the work continues in a
 * detached promise under that lock; GET returns the in-process state, which
 * the admin page polls until `last_run.started_at` matches.
 *
 * ponytail: state is per-process memory (one Fly machine, min 1 running),
 * same as the image audit. A restart mid-run loses the result — the lock
 * expires and the page's poll gives up after its deadline.
 */

export type SupplierImportRun<T = unknown> = {
  started_at: string
  finished_at: string | null
  scope: string
  result: T | null
  error: string | null
}

export type SupplierImportState<T = unknown> = {
  in_progress: boolean
  current: SupplierImportRun<T> | null
  last_run: SupplierImportRun<T> | null
}

const states = new Map<string, SupplierImportState>()

const stateFor = (supplier: string): SupplierImportState => {
  let s = states.get(supplier)
  if (!s) {
    s = { in_progress: false, current: null, last_run: null }
    states.set(supplier, s)
  }
  return s
}

export function getSupplierImportState<T = unknown>(supplier: string): SupplierImportState<T> {
  return { ...stateFor(supplier) } as SupplierImportState<T>
}

/**
 * Take the lock, respond 202 (or 409), and run `work` detached. `work`
 * receives nothing request-bound — callers resolve what they need from
 * `req.scope` up front and close over it.
 */
export async function startSupplierImport<T>(
  req: MedusaRequest,
  res: MedusaResponse,
  opts: { supplier: string; label: string; scope: string; work: () => Promise<T> }
): Promise<void> {
  const state = stateFor(opts.supplier)
  const busy = () =>
    res.status(409).json({
      error: `${opts.label} sync or import is already running — try again in a few minutes.`,
      ...getSupplierImportState(opts.supplier),
    })
  if (state.in_progress) {
    busy()
    return
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as {
    warn: (m: string) => void
  }

  // Resolves once we know whether the lock was taken; the import itself
  // keeps running inside the lock callback after this handler has returned.
  const started = await new Promise<boolean>((resolve) => {
    void withSupplierLock(req.scope, opts.supplier, async () => {
      const run: SupplierImportRun<T> = {
        started_at: new Date().toISOString(),
        finished_at: null,
        scope: opts.scope,
        result: null,
        error: null,
      }
      state.in_progress = true
      state.current = run
      resolve(true)
      await new Promise<void>((r) => setImmediate(r))
      try {
        run.result = await opts.work()
      } catch (err: any) {
        run.error = err?.message ?? String(err)
        logger.warn(`[supplier-import] ${opts.supplier} ${opts.scope} failed: ${run.error}`)
      } finally {
        run.finished_at = new Date().toISOString()
        state.in_progress = false
        state.current = null
        state.last_run = run
      }
    })
      .then((outcome) => {
        if (isLockSkipped(outcome)) resolve(false)
      })
      .catch((err: any) => {
        logger.warn(`[supplier-import] ${opts.supplier} lock wrapper failed: ${err?.message ?? err}`)
        resolve(false)
      })
  })

  if (!started) {
    busy()
    return
  }
  res.status(202).json({ started: true, in_progress: true, started_at: state.current?.started_at })
}
