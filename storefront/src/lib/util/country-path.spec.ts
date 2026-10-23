import { resolveCountryPath } from "./country-path"

const AU = new Set(["au"])
const NONE = new Set<string>()

describe("resolveCountryPath", () => {
  it("leaves a correct path alone", () => {
    expect(resolveCountryPath("/au/products/tee", AU, "us", "au")).toBeNull()
    expect(resolveCountryPath("/AU/cart", AU, undefined, "au")).toBeNull()
  })

  it("adds the country to a bare path", () => {
    expect(resolveCountryPath("/", AU, "au", "au")).toBe("/au")
    expect(resolveCountryPath("/products/tee", AU, "us", "au")).toBe("/au/products/tee")
  })

  it("collapses the stacked prefixes the old redirect produced", () => {
    expect(resolveCountryPath("/us/au/products/tee", AU, "us", "au")).toBe("/au/products/tee")
    expect(resolveCountryPath("/au/us/au/store", AU, "au", "au")).toBe("/au/store")
  })

  it("replaces an unknown country instead of prepending", () => {
    expect(resolveCountryPath("/us/products/tee", AU, "us", "au")).toBe("/au/products/tee")
    expect(resolveCountryPath("/nz", AU, "nz", "au")).toBe("/au")
  })

  it("never redirects a country path when the region list is unavailable", () => {
    expect(resolveCountryPath("/au/products/tee", NONE, "us", "au")).toBeNull()
    expect(resolveCountryPath("/us/au/x", NONE, "us", "au")).toBeNull()
    expect(resolveCountryPath("/products/tee", NONE, "us", "au")).toBe("/au/products/tee")
  })

  it("prefers the visitor's country when it is a region", () => {
    const AUNZ = new Set(["au", "nz"])
    expect(resolveCountryPath("/store", AUNZ, "nz", "au")).toBe("/nz/store")
    expect(resolveCountryPath("/au/nz/store", AUNZ, "au", "au")).toBe("/nz/store")
  })

  it("every redirect target is itself left alone (no loops)", () => {
    for (const p of ["/", "/x", "/us/au/x", "/au/us/au/x", "/us/x", "/nz"]) {
      const target = resolveCountryPath(p, AU, "us", "au")!
      expect(resolveCountryPath(target, AU, "us", "au")).toBeNull()
    }
  })
})
