import { GET } from "../route"

// Mock scope returns the same org service for any resolve key, so the test
// doesn't depend on the module-token import path.
const buildScope = (design: { id: string; organisation_id: string } | null) => {
  const orgService = {
    retrieveOrganisationDesign: jest.fn(async (id: string) => {
      if (!design || id !== design.id) throw new Error("not found")
      return { ...design }
    }),
  }
  return {
    orgService,
    scope: { resolve: jest.fn(() => orgService) },
  }
}

const buildReq = (scope: any, params: Record<string, string>) => ({
  scope,
  params,
  query: {},
})

const buildRes = () => {
  const res: any = { statusCode: 200, body: undefined as unknown }
  res.json = jest.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  res.status = jest.fn((code: number) => {
    res.statusCode = code
    return res
  })
  return res
}

describe("GET /admin/organisations/:id/designs/:design_id", () => {
  it("returns the design when it belongs to the org in the path", async () => {
    const design = { id: "orgdsn_1", organisation_id: "org_a" }
    const { scope } = buildScope(design)
    const res = buildRes()

    await GET(
      buildReq(scope, { id: "org_a", design_id: "orgdsn_1" }) as any,
      res as any
    )

    expect(res.statusCode).toBe(200)
    expect((res.body as any).design).toMatchObject({ id: "orgdsn_1" })
  })

  it("404s when the design belongs to a different org (cross-org read blocked)", async () => {
    const design = { id: "orgdsn_1", organisation_id: "org_b" }
    const { scope } = buildScope(design)
    const res = buildRes()

    await GET(
      buildReq(scope, { id: "org_a", design_id: "orgdsn_1" }) as any,
      res as any
    )

    expect(res.statusCode).toBe(404)
    expect(res.body).toMatchObject({ error: "not_found" })
  })

  it("404s when the design does not exist", async () => {
    const { scope } = buildScope(null)
    const res = buildRes()

    await GET(
      buildReq(scope, { id: "org_a", design_id: "missing" }) as any,
      res as any
    )

    expect(res.statusCode).toBe(404)
  })
})
