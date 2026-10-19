import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import {
  SUPPLIER_LOCK_TTL_SECONDS,
  isLockSkipped,
  withSupplierLock,
} from "../supplier-sync-lock"

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

function buildContainer(locking: Record<string, jest.Mock> | null) {
  return {
    resolve: jest.fn((key: string) => {
      if (key === ContainerRegistrationKeys.LOGGER) return logger
      if (key === Modules.LOCKING) {
        if (!locking) throw new Error("Could not resolve 'locking'")
        return locking
      }
      throw new Error(`unexpected resolve(${key})`)
    }),
  } as any
}

describe("withSupplierLock", () => {
  beforeEach(() => jest.clearAllMocks())

  it("runs fn under the supplier key with a 3h TTL and releases with the same owner", async () => {
    const locking = { acquire: jest.fn(async () => undefined), release: jest.fn(async () => true) }
    const fn = jest.fn(async () => "done")

    const result = await withSupplierLock(buildContainer(locking), "ascolour", fn)

    expect(result).toBe("done")
    expect(fn).toHaveBeenCalledTimes(1)
    const [key, acquireArgs] = locking.acquire.mock.calls[0]
    expect(key).toBe("supplier-sync:ascolour")
    expect(acquireArgs.expire).toBe(SUPPLIER_LOCK_TTL_SECONDS)
    expect(typeof acquireArgs.ownerId).toBe("string")
    expect(locking.release).toHaveBeenCalledWith(key, { ownerId: acquireArgs.ownerId })
  })

  it("returns { skipped } without running fn when the lock is held", async () => {
    const locking = {
      acquire: jest.fn(async () => {
        throw new Error('Failed to acquire lock for key "supplier-sync:fashionbiz"')
      }),
      release: jest.fn(),
    }
    const fn = jest.fn(async () => "done")

    const result = await withSupplierLock(buildContainer(locking), "fashionbiz", fn)

    expect(isLockSkipped(result)).toBe(true)
    expect(fn).not.toHaveBeenCalled()
    expect(locking.release).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("already running"))
  })

  it("releases the lock when fn throws and rethrows", async () => {
    const locking = { acquire: jest.fn(async () => undefined), release: jest.fn(async () => true) }
    const boom = new Error("supplier API down")

    await expect(
      withSupplierLock(buildContainer(locking), "aussiepacific", async () => {
        throw boom
      })
    ).rejects.toBe(boom)
    expect(locking.release).toHaveBeenCalledTimes(1)
  })

  it("runs fn unlocked when the locking module is not registered", async () => {
    const fn = jest.fn(async () => 42)

    const result = await withSupplierLock(buildContainer(null), "ascolour", fn)

    expect(result).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
