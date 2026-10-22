import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { shouldSendMarketingEmail } from "../marketing-email"
import { ADMIN_WORKSPACE_MODULE } from "../../modules/admin-workspace"

// Mocking the constants module so the suppression-table flag is
// flippable per-test without env-var games.
const constantsMock = jest.requireMock("../constants") as {
  EMAIL_SUPPRESSION_TABLE_ENABLED: boolean
  MARKETING_EMAILS_SINCE: Date | null
}
jest.mock("../constants", () => ({
  EMAIL_SUPPRESSION_TABLE_ENABLED: false,
  MARKETING_EMAILS_SINCE: null,
}))

type CustomerRow = {
  id: string
  email: string
  metadata: Record<string, unknown>
  created_at?: string
}
type SuppressionRow = { email: string; template_kind: string | null }

const buildContainer = (opts: {
  customers?: CustomerRow[]
  suppressions?: SuppressionRow[]
  listEmailSuppressionsThrows?: boolean
} = {}) => {
  const customers = opts.customers ?? []
  const suppressions = opts.suppressions ?? []
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

  const listEmailSuppressions = opts.listEmailSuppressionsThrows
    ? jest.fn(async () => {
        throw new Error("query failed")
      })
    : jest.fn(async (filter: { email: string }) =>
        suppressions.filter(
          (s) => s.email.toLowerCase() === filter.email.toLowerCase()
        )
      )

  const query = {
    graph: jest.fn(async ({ filters }: any) => {
      if (filters?.id) {
        return { data: customers.filter((c) => c.id === filters.id) }
      }
      if (filters?.email) {
        return {
          data: customers.filter(
            (c) => c.email.toLowerCase() === filters.email.toLowerCase()
          ),
        }
      }
      return { data: [] }
    }),
  }

  return {
    resolve: jest.fn((key: string) => {
      if (key === ADMIN_WORKSPACE_MODULE) {
        return { listEmailSuppressions }
      }
      if (key === ContainerRegistrationKeys.LOGGER) return logger
      if (key === ContainerRegistrationKeys.QUERY) return query
      throw new Error(`unexpected resolve(${key})`)
    }),
    _spies: { listEmailSuppressions, query, logger },
  } as any
}

describe("shouldSendMarketingEmail", () => {
  beforeEach(() => {
    constantsMock.EMAIL_SUPPRESSION_TABLE_ENABLED = false
  })

  it("returns ok when no customer row exists (guest is allowed by default)", async () => {
    const container = buildContainer({ customers: [] })
    const result = await shouldSendMarketingEmail({
      container,
      email: "guest@example.com",
      template_kind: "cart_reminder",
    })
    expect(result).toEqual({ ok: true })
  })

  it("returns ok when customer consent is undefined/null (default-allow)", async () => {
    const container = buildContainer({
      customers: [{ id: "c1", email: "alice@scprints.com.au", metadata: {} }],
    })
    const result = await shouldSendMarketingEmail({
      container,
      email: "alice@scprints.com.au",
      template_kind: "winback",
    })
    expect(result).toEqual({ ok: true })
  })

  it("returns ok when customer consent is true", async () => {
    const container = buildContainer({
      customers: [
        {
          id: "c1",
          email: "alice@scprints.com.au",
          metadata: { marketing_consent_email: true },
        },
      ],
    })
    const result = await shouldSendMarketingEmail({
      container,
      email: "alice@scprints.com.au",
      template_kind: "reorder_reminder",
    })
    expect(result).toEqual({ ok: true })
  })

  it("blocks when customer consent is explicitly false", async () => {
    const container = buildContainer({
      customers: [
        {
          id: "c1",
          email: "bob@scprints.com.au",
          metadata: { marketing_consent_email: false },
        },
      ],
    })
    const result = await shouldSendMarketingEmail({
      container,
      email: "bob@scprints.com.au",
      template_kind: "nps_request",
    })
    expect(result).toEqual({ ok: false, reason: "consent_false" })
  })

  it("returns no_email when email is empty", async () => {
    const container = buildContainer()
    const result = await shouldSendMarketingEmail({
      container,
      email: "",
      template_kind: "cart_reminder",
    })
    expect(result).toEqual({ ok: false, reason: "no_email" })
  })

  it("does not query the suppression table when the flag is off", async () => {
    constantsMock.EMAIL_SUPPRESSION_TABLE_ENABLED = false
    const container = buildContainer({
      customers: [{ id: "c1", email: "x@y.z", metadata: {} }],
      suppressions: [{ email: "x@y.z", template_kind: null }],
    })
    const result = await shouldSendMarketingEmail({
      container,
      email: "x@y.z",
      template_kind: "winback",
    })
    expect(result).toEqual({ ok: true })
    expect(container._spies.listEmailSuppressions).not.toHaveBeenCalled()
  })

  it("blocks on global suppression when the flag is on", async () => {
    constantsMock.EMAIL_SUPPRESSION_TABLE_ENABLED = true
    const container = buildContainer({
      customers: [{ id: "c1", email: "x@y.z", metadata: {} }],
      suppressions: [{ email: "x@y.z", template_kind: null }],
    })
    const result = await shouldSendMarketingEmail({
      container,
      email: "x@y.z",
      template_kind: "winback",
    })
    expect(result).toEqual({ ok: false, reason: "suppressed_global" })
  })

  it("blocks on per-stream suppression matching the template_kind", async () => {
    constantsMock.EMAIL_SUPPRESSION_TABLE_ENABLED = true
    const container = buildContainer({
      customers: [{ id: "c1", email: "x@y.z", metadata: {} }],
      suppressions: [{ email: "x@y.z", template_kind: "winback" }],
    })
    const blocked = await shouldSendMarketingEmail({
      container,
      email: "x@y.z",
      template_kind: "winback",
    })
    expect(blocked).toEqual({ ok: false, reason: "suppressed_stream" })

    const allowed = await shouldSendMarketingEmail({
      container,
      email: "x@y.z",
      template_kind: "cart_reminder",
    })
    expect(allowed).toEqual({ ok: true })
  })

  it("soft-fails the suppression check (allows send) when the query throws", async () => {
    constantsMock.EMAIL_SUPPRESSION_TABLE_ENABLED = true
    const container = buildContainer({
      customers: [{ id: "c1", email: "x@y.z", metadata: {} }],
      listEmailSuppressionsThrows: true,
    })
    const result = await shouldSendMarketingEmail({
      container,
      email: "x@y.z",
      template_kind: "winback",
    })
    expect(result).toEqual({ ok: true })
    expect(container._spies.logger.warn).toHaveBeenCalled()
  })

  it("prefers customer_id lookup when provided", async () => {
    const container = buildContainer({
      customers: [
        {
          id: "cust_xyz",
          email: "old@y.z",
          metadata: { marketing_consent_email: false },
        },
      ],
    })
    const result = await shouldSendMarketingEmail({
      container,
      email: "new@y.z", // different email after a change
      customer_id: "cust_xyz",
      template_kind: "winback",
    })
    expect(result).toEqual({ ok: false, reason: "consent_false" })
    expect(container._spies.query.graph).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { id: "cust_xyz" } })
    )
  })

  describe("MARKETING_EMAILS_SINCE cutoff", () => {
    afterEach(() => {
      constantsMock.MARKETING_EMAILS_SINCE = null
    })
    const customers = [
      { id: "old", email: "old@y.z", metadata: {}, created_at: "2026-06-01T00:00:00Z" },
      { id: "new", email: "new@y.z", metadata: {}, created_at: "2026-11-01T00:00:00Z" },
    ]

    it("skips customers created before the cutoff for reorder/winback only", async () => {
      constantsMock.MARKETING_EMAILS_SINCE = new Date("2026-10-23T00:00:00Z")
      const container = buildContainer({ customers })
      const send = (email: string, template_kind: any) =>
        shouldSendMarketingEmail({ container, email, template_kind })
      expect(await send("old@y.z", "winback")).toEqual({ ok: false, reason: "before_cutoff" })
      expect(await send("old@y.z", "reorder_reminder")).toEqual({ ok: false, reason: "before_cutoff" })
      expect(await send("old@y.z", "cart_reminder")).toEqual({ ok: true })
      expect(await send("new@y.z", "winback")).toEqual({ ok: true })
    })

    it("does nothing when unset", async () => {
      const container = buildContainer({ customers })
      expect(
        await shouldSendMarketingEmail({ container, email: "old@y.z", template_kind: "winback" })
      ).toEqual({ ok: true })
    })
  })
})
