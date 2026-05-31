import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import { ADMIN_WORKSPACE_MODULE } from "../../modules/admin-workspace"
import { pickNextOwner, setOwner, getOwner, clearOwner } from "../crm-owners"
import { AUDIT_ENTITY } from "../audit-entities"

type RotationRow = {
  id: string
  user_id: string
  enabled: boolean
  position: number
  last_picked_at: Date | string | null
}

type AssignmentRow = {
  id: string
  user_id: string
  assigned_at: Date | string
  assigned_by: string | null
  reason: string | null
}

const buildContainer = (state: {
  rotation?: RotationRow[]
  assignment?: AssignmentRow | null
  // Optional: an existing assignment linked to entity_id (only one for the test).
  linkedAssignmentByEntity?: Record<string, AssignmentRow>
  // Optional: mock for the raw `__pg_connection__.raw` call pickNextOwner uses
  // for its atomic rotation claim. Defaults to "no row claimed".
  pgRaw?: (...args: any[]) => Promise<any>
} = {}) => {
  const rotation = [...(state.rotation ?? [])]
  const linkedAssignmentByEntity = { ...(state.linkedAssignmentByEntity ?? {}) }

  const listCrmOwnerRotations = jest.fn(
    async (filter: any) => {
      let rows = rotation
      if (filter?.enabled !== undefined)
        rows = rows.filter((r) => r.enabled === filter.enabled)
      if (filter?.user_id)
        rows = rows.filter((r) => r.user_id === filter.user_id)
      return rows
    }
  )
  const updateCrmOwnerRotations = jest.fn(async (id: string, patch: any) => {
    const r = rotation.find((r) => r.id === id)
    if (r) Object.assign(r, patch)
    return r
  })
  const createCrmOwnerRotations = jest.fn(async (input: any) => {
    const created: RotationRow = {
      id: `crmrot_${rotation.length + 1}`,
      ...input,
    }
    rotation.push(created)
    return created
  })
  const deleteCrmOwnerRotations = jest.fn(async (ids: string[]) => {
    for (const id of ids) {
      const idx = rotation.findIndex((r) => r.id === id)
      if (idx >= 0) rotation.splice(idx, 1)
    }
  })

  const createCrmOwnerAssignments = jest.fn(async (input: any) => {
    const id = `crmown_${Math.random().toString(36).slice(2, 8)}`
    return { id, ...input }
  })
  const updateCrmOwnerAssignments = jest.fn(async (id: string, patch: any) => ({
    id,
    ...patch,
  }))
  const deleteCrmOwnerAssignments = jest.fn(async () => undefined)

  const createAuditLogs = jest.fn(async () => ({ id: "aud_1" }))

  const ws = {
    listCrmOwnerRotations,
    updateCrmOwnerRotations,
    createCrmOwnerRotations,
    deleteCrmOwnerRotations,
    createCrmOwnerAssignments,
    updateCrmOwnerAssignments,
    deleteCrmOwnerAssignments,
    createAuditLogs,
  }

  const linkCreate = jest.fn(async () => undefined)
  const linkDismiss = jest.fn(async () => undefined)

  const queryGraph = jest.fn(async ({ filters }: any) => {
    const id = filters?.id
    if (!id) return { data: [] }
    const existing = linkedAssignmentByEntity[id]
    if (!existing) return { data: [{ id, crm_owner_assignment: null }] }
    return {
      data: [
        {
          id,
          crm_owner_assignment: {
            id: existing.id,
            user_id: existing.user_id,
            assigned_at: existing.assigned_at,
            assigned_by: existing.assigned_by,
            reason: existing.reason,
          },
        },
      ],
    }
  })

  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

  const pgRaw = jest.fn(state.pgRaw ?? (async () => ({ rows: [] })))
  const pg = { raw: pgRaw }

  return {
    resolve: jest.fn((key: string) => {
      if (key === ADMIN_WORKSPACE_MODULE) return ws
      if (key === ContainerRegistrationKeys.LOGGER) return logger
      if (key === ContainerRegistrationKeys.QUERY)
        return { graph: queryGraph }
      if (key === ContainerRegistrationKeys.LINK)
        return { create: linkCreate, dismiss: linkDismiss }
      if (key === "__pg_connection__") return pg
      throw new Error(`unexpected resolve(${key})`)
    }),
    _state: { rotation, linkedAssignmentByEntity },
    _spies: {
      listCrmOwnerRotations,
      updateCrmOwnerRotations,
      createCrmOwnerAssignments,
      updateCrmOwnerAssignments,
      deleteCrmOwnerAssignments,
      createAuditLogs,
      linkCreate,
      linkDismiss,
      queryGraph,
      logger,
      pgRaw,
    },
  } as any
}

describe("pickNextOwner", () => {
  // The pick is now a single atomic `UPDATE … WHERE id = (SELECT … FOR UPDATE
  // SKIP LOCKED) RETURNING user_id` so concurrent order.placed events can't
  // assign the same teammate. The oldest-first / never-picked-first / position
  // tiebreak ordering lives in the SQL ORDER BY (exercised by Postgres, not
  // unit-testable here); these tests cover the claim contract + plumbing.

  it("returns null when the atomic claim selects no row", async () => {
    const container = buildContainer({ pgRaw: async () => ({ rows: [] }) })
    expect(await pickNextOwner({ container })).toBeNull()
  })

  it("returns the user claimed by the atomic UPDATE…RETURNING", async () => {
    const container = buildContainer({
      pgRaw: async () => ({ rows: [{ user_id: "u2" }] }),
    })
    expect(await pickNextOwner({ container })).toEqual({ user_id: "u2" })
  })

  it("claims atomically: oldest/never-picked first, FOR UPDATE SKIP LOCKED", async () => {
    const container = buildContainer({
      pgRaw: async () => ({ rows: [{ user_id: "u1" }] }),
    })
    await pickNextOwner({ container })
    const sql = String(container._spies.pgRaw.mock.calls[0][0]).toLowerCase()
    expect(sql).toContain('update "crm_owner_rotation"')
    expect(sql).toContain("enabled = true")
    expect(sql).toContain("last_picked_at asc nulls first")
    expect(sql).toContain("position asc")
    expect(sql).toContain("for update skip locked")
    expect(sql).toContain("returning user_id")
  })

  it("returns null (and doesn't throw) when the claim query errors", async () => {
    const container = buildContainer({
      pgRaw: async () => {
        throw new Error("db down")
      },
    })
    expect(await pickNextOwner({ container })).toBeNull()
  })
})

describe("setOwner", () => {
  it("creates an assignment + link when entity has no existing owner", async () => {
    const container = buildContainer({ linkedAssignmentByEntity: {} })
    await setOwner({
      container,
      entity: AUDIT_ENTITY.CUSTOMER,
      entity_id: "cust_1",
      user_id: "user_alice",
      actor: "user_actor",
    })
    expect(container._spies.createCrmOwnerAssignments).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user_alice",
        assigned_by: "user_actor",
      })
    )
    expect(container._spies.linkCreate).toHaveBeenCalled()
    expect(container._spies.createAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "customer",
        action: "owner_changed",
        details: expect.objectContaining({
          to_user_id: "user_alice",
          from_user_id: null,
        }),
      })
    )
  })

  it("updates the existing assignment row (does NOT create a duplicate)", async () => {
    const container = buildContainer({
      linkedAssignmentByEntity: {
        cust_1: {
          id: "crmown_existing",
          user_id: "user_old",
          assigned_at: new Date("2026-04-01T00:00:00Z"),
          assigned_by: null,
          reason: null,
        },
      },
    })
    await setOwner({
      container,
      entity: AUDIT_ENTITY.CUSTOMER,
      entity_id: "cust_1",
      user_id: "user_new",
      actor: "user_actor",
    })
    expect(container._spies.updateCrmOwnerAssignments).toHaveBeenCalledWith(
      "crmown_existing",
      expect.objectContaining({ user_id: "user_new" })
    )
    expect(container._spies.createCrmOwnerAssignments).not.toHaveBeenCalled()
    expect(container._spies.linkCreate).not.toHaveBeenCalled()
    expect(container._spies.createAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          from_user_id: "user_old",
          to_user_id: "user_new",
        }),
      })
    )
  })

  it("supports orders as well as customers (correct linkable)", async () => {
    const container = buildContainer({ linkedAssignmentByEntity: {} })
    await setOwner({
      container,
      entity: AUDIT_ENTITY.ORDER,
      entity_id: "ord_1",
      user_id: "user_x",
    })
    const linkCall = container._spies.linkCreate.mock.calls[0][0]
    expect(linkCall[Modules.ORDER]).toEqual({ order_id: "ord_1" })
    expect(linkCall[ADMIN_WORKSPACE_MODULE]).toHaveProperty(
      "crm_owner_assignment_id"
    )
  })
})

describe("getOwner", () => {
  it("returns the owner row when assignment exists", async () => {
    const container = buildContainer({
      linkedAssignmentByEntity: {
        ord_1: {
          id: "crmown_1",
          user_id: "user_alice",
          assigned_at: new Date("2026-05-01T10:00:00Z"),
          assigned_by: "user_actor",
          reason: "manual",
        },
      },
    })
    const owner = await getOwner({
      container,
      entity: AUDIT_ENTITY.ORDER,
      entity_id: "ord_1",
    })
    expect(owner).toMatchObject({
      assignment_id: "crmown_1",
      user_id: "user_alice",
      assigned_by: "user_actor",
      reason: "manual",
    })
  })

  it("returns null when no assignment is linked", async () => {
    const container = buildContainer({ linkedAssignmentByEntity: {} })
    const owner = await getOwner({
      container,
      entity: AUDIT_ENTITY.CUSTOMER,
      entity_id: "cust_nobody",
    })
    expect(owner).toBeNull()
  })
})

describe("clearOwner", () => {
  it("dismisses the link, deletes the row, and writes an audit", async () => {
    const container = buildContainer({
      linkedAssignmentByEntity: {
        cust_1: {
          id: "crmown_x",
          user_id: "user_old",
          assigned_at: new Date(),
          assigned_by: null,
          reason: null,
        },
      },
    })
    await clearOwner({
      container,
      entity: AUDIT_ENTITY.CUSTOMER,
      entity_id: "cust_1",
      actor: "user_actor",
    })
    expect(container._spies.linkDismiss).toHaveBeenCalled()
    expect(container._spies.deleteCrmOwnerAssignments).toHaveBeenCalledWith([
      "crmown_x",
    ])
    expect(container._spies.createAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "unassigned",
        details: expect.objectContaining({ from_user_id: "user_old" }),
      })
    )
  })

  it("is idempotent — no-op when nothing to clear", async () => {
    const container = buildContainer({ linkedAssignmentByEntity: {} })
    await clearOwner({
      container,
      entity: AUDIT_ENTITY.CUSTOMER,
      entity_id: "cust_nobody",
    })
    expect(container._spies.linkDismiss).not.toHaveBeenCalled()
    expect(container._spies.deleteCrmOwnerAssignments).not.toHaveBeenCalled()
  })
})
