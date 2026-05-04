import {
  applyCategoryIdsToCreates,
  categoryPathKey,
  resolveCategoryPaths,
  slugifyCategoryHandle,
  type CategoryClient,
  type CategoryRecord,
} from "../spreadsheet-sync-categories"

type CreateCall = {
  name: string
  handle?: string
  parent_category_id?: string | null
}

const makeMockClient = (existing: CategoryRecord[]) => {
  const store = [...existing]
  const createCalls: CreateCall[] = []
  let nextId = 1
  const client: CategoryClient = {
    async list(query) {
      const limit = query.limit ?? 200
      const offset = query.offset ?? 0
      const slice = store.slice(offset, offset + limit)
      return { product_categories: slice, count: store.length, limit, offset }
    },
    async create(body) {
      createCalls.push({
        name: body.name,
        handle: body.handle,
        parent_category_id: body.parent_category_id ?? null,
      })
      const cat: CategoryRecord = {
        id: `pcat_test_${nextId++}`,
        name: body.name,
        handle: body.handle ?? slugifyCategoryHandle(body.name),
        parent_category_id: body.parent_category_id ?? null,
      }
      store.push(cat)
      return { product_category: cat }
    },
  }
  return { client, createCalls, store }
}

describe("spreadsheet-sync-categories", () => {
  it("slugifyCategoryHandle produces stable handles", () => {
    expect(slugifyCategoryHandle("Chefs & Waiters Jackets")).toBe("chefs-waiters-jackets")
    expect(slugifyCategoryHandle("   ")).toBe("category")
  })

  it("categoryPathKey is case-insensitive and arrow-joined", () => {
    expect(categoryPathKey(["Hospitality", "Chefs & Waiters Jackets"])).toBe(
      "hospitality > chefs & waiters jackets"
    )
  })

  it("resolveCategoryPaths reuses an existing category by handle scoped to its parent", () => {
    const existing: CategoryRecord[] = [
      { id: "pcat_h", name: "Hospitality", handle: "hospitality", parent_category_id: null },
      {
        id: "pcat_h_c",
        name: "Chefs & Waiters Jackets",
        handle: "chefs-waiters-jackets",
        parent_category_id: "pcat_h",
      },
    ]
    const { client, createCalls } = makeMockClient(existing)

    return resolveCategoryPaths(client, [["Hospitality", "Chefs & Waiters Jackets"]]).then(
      ({ idByPathKey, createdLog }) => {
        expect(createCalls).toEqual([])
        expect(createdLog).toEqual([])
        expect(idByPathKey.get("hospitality > chefs & waiters jackets")).toBe("pcat_h_c")
      }
    )
  })

  it("resolveCategoryPaths auto-creates missing levels with the right parent chain", async () => {
    const { client, createCalls } = makeMockClient([])
    const { idByPathKey, createdLog } = await resolveCategoryPaths(client, [
      ["Hospitality", "Chefs & Waiters Jackets"],
    ])
    expect(createCalls).toEqual([
      { name: "Hospitality", handle: "hospitality", parent_category_id: null },
      {
        name: "Chefs & Waiters Jackets",
        handle: "chefs-waiters-jackets",
        parent_category_id: "pcat_test_1",
      },
    ])
    expect(idByPathKey.get("hospitality > chefs & waiters jackets")).toBe("pcat_test_2")
    expect(createdLog.length).toBe(2)
  })

  it("resolveCategoryPaths shares parent records between sibling paths (no duplicate parent create)", async () => {
    const { client, createCalls } = makeMockClient([])
    const { idByPathKey } = await resolveCategoryPaths(client, [
      ["Apparel", "T-Shirts"],
      ["Apparel", "Polos"],
    ])
    const apparelCreates = createCalls.filter((c) => c.name === "Apparel")
    expect(apparelCreates.length).toBe(1)
    expect(idByPathKey.get("apparel > t-shirts")).toBeDefined()
    expect(idByPathKey.get("apparel > polos")).toBeDefined()
  })

  it("resolveCategoryPaths treats same-named categories under different parents as distinct", async () => {
    const { client } = makeMockClient([])
    const { idByPathKey } = await resolveCategoryPaths(client, [
      ["Apparel", "Tops"],
      ["Workwear", "Tops"],
    ])
    expect(idByPathKey.get("apparel > tops")).not.toBe(idByPathKey.get("workwear > tops"))
  })

  it("applyCategoryIdsToCreates writes a categories: [{id}] array onto each matching payload", () => {
    const creates: Array<Record<string, unknown> & { handle?: string }> = [
      { handle: "p-a" },
      { handle: "p-b" },
      { handle: "p-c" },
    ]
    const pathsByHandle = new Map<string, string[][]>([
      ["p-a", [["Apparel", "Tops"]]],
      ["p-b", [
        ["Apparel", "Tops"],
        ["Workwear", "Hi-Vis Tops"],
      ]],
    ])
    const idByPathKey = new Map<string, string>([
      ["apparel > tops", "pcat_1"],
      ["workwear > hi-vis tops", "pcat_2"],
    ])
    applyCategoryIdsToCreates(creates, pathsByHandle, idByPathKey)
    expect(creates[0]!.categories).toEqual([{ id: "pcat_1" }])
    expect(creates[1]!.categories).toEqual([{ id: "pcat_1" }, { id: "pcat_2" }])
    expect(creates[2]!.categories).toBeUndefined()
  })
})
