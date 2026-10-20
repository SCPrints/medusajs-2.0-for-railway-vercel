import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { getSupplierImportState, startSupplierImport } from "../supplier-import-run"

const logger = { info: jest.fn(), warn: jest.fn() }

const fakeReq = (locking: unknown) =>
  ({
    scope: {
      resolve: (key: string) => {
        if (key === ContainerRegistrationKeys.LOGGER) return logger
        if (key === Modules.LOCKING && locking) return locking
        throw new Error(`not registered: ${key}`)
      },
    },
  }) as any

const fakeRes = () => {
  const out: { status?: number; body?: any } = {}
  const res: any = {
    status: (s: number) => ((out.status = s), res),
    json: (b: any) => ((out.body = b), res),
  }
  return { res, out }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe("startSupplierImport (review 2-8)", () => {
  it("answers 202 before the work runs, then exposes the result via state", async () => {
    let release!: (v: { imported: string[] }) => void
    const work = jest.fn(() => new Promise<{ imported: string[] }>((r) => (release = r)))
    const { res, out } = fakeRes()

    await startSupplierImport(fakeReq(null), res, {
      supplier: "test-a",
      label: "A test",
      scope: "2 styles",
      work,
    })

    expect(out.status).toBe(202)
    expect(out.body.started).toBe(true)
    expect(typeof out.body.started_at).toBe("string")
    expect(getSupplierImportState("test-a").in_progress).toBe(true)

    // A second start while running is refused without touching the lock.
    const second = fakeRes()
    await startSupplierImport(fakeReq(null), second.res, {
      supplier: "test-a",
      label: "A test",
      scope: "1 style",
      work: jest.fn(),
    })
    expect(second.out.status).toBe(409)

    await tick()
    expect(work).toHaveBeenCalledTimes(1)
    release({ imported: ["5001"] })
    await tick()

    const state = getSupplierImportState<{ imported: string[] }>("test-a")
    expect(state.in_progress).toBe(false)
    expect(state.last_run?.started_at).toBe(out.body.started_at)
    expect(state.last_run?.result).toEqual({ imported: ["5001"] })
    expect(state.last_run?.error).toBeNull()
  })

  it("records a thrown error on the run instead of leaving in_progress stuck", async () => {
    const { res } = fakeRes()
    await startSupplierImport(fakeReq(null), res, {
      supplier: "test-b",
      label: "A test",
      scope: "1 style",
      work: async () => {
        throw new Error("supplier 500")
      },
    })
    await tick()
    await tick()
    const state = getSupplierImportState("test-b")
    expect(state.in_progress).toBe(false)
    expect(state.last_run?.error).toBe("supplier 500")
  })

  it("409s when another process holds the supplier lock", async () => {
    const locking = {
      acquire: jest.fn(async () => {
        throw new Error("held")
      }),
      release: jest.fn(async () => undefined),
    }
    const work = jest.fn()
    const { res, out } = fakeRes()
    await startSupplierImport(fakeReq(locking), res, {
      supplier: "test-c",
      label: "A test",
      scope: "1 style",
      work,
    })
    expect(out.status).toBe(409)
    expect(work).not.toHaveBeenCalled()
    expect(getSupplierImportState("test-c").in_progress).toBe(false)
  })
})
