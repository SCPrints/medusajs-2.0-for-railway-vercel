import { GET } from "../route"

// Mock scope returns the same org service for any resolve key, so the test
// doesn't depend on the module-token import path.
const buildScope = (
  destination: { id: string; organisation_id: string } | null
) => {
  const orgService = {
    retrieveOrganisationDestination: jest.fn(async (id: string) => {
      if (!destination || id !== destination.id) throw new Error("not found")
      return { ...destination }
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

describe("GET /admin/organisations/:id/destinations/:destination_id", () => {
  it("returns the destination when it belongs to the org in the path", async () => {
    const destination = { id: "orgdest_1", organisation_id: "org_a" }
    const { scope } = buildScope(destination)
    const res = buildRes()

    await GET(
      buildReq(scope, { id: "org_a", destination_id: "orgdest_1" }) as any,
      res as any
    )

    expect(res.statusCode).toBe(200)
    expect((res.body as any).destination).toMatchObject({ id: "orgdest_1" })
  })

  it("404s when the destination belongs to a different org (cross-org read blocked)", async () => {
    const destination = { id: "orgdest_1", organisation_id: "org_b" }
    const { scope } = buildScope(destination)
    const res = buildRes()

    await GET(
      buildReq(scope, { id: "org_a", destination_id: "orgdest_1" }) as any,
      res as any
    )

    expect(res.statusCode).toBe(404)
    expect(res.body).toMatchObject({ error: "not_found" })
  })

  it("404s when the destination does not exist", async () => {
    const { scope } = buildScope(null)
    const res = buildRes()

    await GET(
      buildReq(scope, { id: "org_a", destination_id: "missing" }) as any,
      res as any
    )

    expect(res.statusCode).toBe(404)
  })
})
