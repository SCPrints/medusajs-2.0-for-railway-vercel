import { decodeJobPricerSeed, seedToCustomizerMetadata, type JobPricerSeed } from "./quote-seed"

const encode = (seed: unknown) =>
  Buffer.from(JSON.stringify(seed), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

describe("job pricer seed", () => {
  const seed: JobPricerSeed = {
    v: 1,
    variant: "v_black_m",
    sizes: [{ size: "M", quantity: 10 }, { size: "L", quantity: 0 }],
    sides: [
      { side: "front", method: "screen", colours: 3, dark: true },
      { side: "back", method: "print", sizeId: "up_to_a3" },
      { side: "printed_tag", method: "embroidery" },
      { side: "hood" as any, method: "print", sizeId: "up_to_a4" },
    ],
  }

  it("round-trips base64url and drops sides the Studio doesn't know", () => {
    const meta = seedToCustomizerMetadata(decodeJobPricerSeed(encode(seed))!, ["v_black_m"])!
    expect(meta.variantId).toBe("v_black_m")
    expect(meta.sizes).toEqual([{ size: "M", quantity: 10 }])
    expect(meta.sideDecorationMethods).toEqual({ front: "screen", back: "print", printed_tag: "embroidery" })
    expect(meta.sideScreenConfigs?.front).toMatchObject({ colours: 3, darkGarment: true, coloursAuto: false })
    expect(meta.prints).toEqual([{ side: "back", sizeId: "up_to_a3" }])
    expect(meta.activeSide).toBe("front")
  })

  it("ignores an unknown variant and rejects garbage", () => {
    expect(seedToCustomizerMetadata(seed, ["other"])!.variantId).toBeUndefined()
    expect(decodeJobPricerSeed("not-base64!!")).toBeNull()
    expect(decodeJobPricerSeed(encode({ v: 2 }))).toBeNull()
  })
})
