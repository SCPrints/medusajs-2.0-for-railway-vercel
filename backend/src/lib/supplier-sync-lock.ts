import type { ILockingModule, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { randomUUID } from "node:crypto"

/**
 * One supplier sync at a time (code review 2026-10, finding 2-2).
 *
 * The cron, the manual scripts and the admin import routes all rewrite the
 * same ~10k inventory_level rows. Two overlapping runs deadlock in Postgres
 * and the loser's workflow compensation writes stale quantities over the
 * winner's fresh ones. Key: `supplier-sync:<supplier>`.
 *
 * Locking API (verified in @medusajs/locking-redis 2.14.2): `execute()`
 * couples the acquisition wait with the lock TTL (expire = timeout || 60s,
 * and it queues for up to `timeout` seconds, min 1), so it can't express
 * "hold for 3h, fail fast if held". `acquire()` with no awaitQueue throws
 * immediately when another owner holds the key and honours `expire` as the
 * TTL; `release()` only deletes the key when the ownerId matches. ownerId
 * must be unique per run — the same owner re-acquires successfully.
 */
export const SUPPLIER_LOCK_TTL_SECONDS = 3 * 60 * 60

export type SupplierLockSkipped = { skipped: true; reason: "already_running" }

export const isLockSkipped = (v: unknown): v is SupplierLockSkipped =>
  !!v && typeof v === "object" && (v as SupplierLockSkipped).skipped === true

export const supplierLockKey = (supplier: string) => `supplier-sync:${supplier}`

let warnedNoLockModule = false

export async function withSupplierLock<T>(
  container: MedusaContainer,
  supplier: string,
  fn: () => Promise<T>
): Promise<T | SupplierLockSkipped> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as {
    info: (m: string) => void
    warn: (m: string) => void
  }

  let locking: ILockingModule | null = null
  try {
    locking = container.resolve(Modules.LOCKING) as ILockingModule
  } catch {
    if (!warnedNoLockModule) {
      warnedNoLockModule = true
      logger.warn("[supplier-sync-lock] locking module not registered — running unlocked")
    }
    return fn()
  }

  const key = supplierLockKey(supplier)
  const ownerId = randomUUID()
  try {
    await locking.acquire(key, { ownerId, expire: SUPPLIER_LOCK_TTL_SECONDS })
  } catch {
    logger.warn(`[supplier-sync-lock] ${supplier} sync already running — skipping`)
    return { skipped: true, reason: "already_running" }
  }
  try {
    return await fn()
  } finally {
    await locking.release(key, { ownerId }).catch(() => undefined)
  }
}
