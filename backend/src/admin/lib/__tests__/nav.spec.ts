import { toRoute } from "../nav"

describe("toRoute", () => {
  it("strips the /app basename from admin paths, keeping query and hash", () => {
    expect(toRoute("/app/jobs/order_1")).toBe("/jobs/order_1")
    expect(toRoute("/app/jobs/q_1#quote")).toBe("/jobs/q_1#quote")
    expect(toRoute("/app/production?stage=received")).toBe("/production?stage=received")
    expect(toRoute("/app")).toBe("/")
    expect(toRoute("/app?x=1")).toBe("/?x=1")
  })

  it("leaves everything outside the admin to a normal page load", () => {
    expect(toRoute("https://scprints.com.au/au/products/x")).toBeNull()
    expect(toRoute("/application")).toBeNull()
    expect(toRoute("mailto:a@b.c")).toBeNull()
    expect(toRoute("/admin/orders/1/mockup-pdf")).toBeNull()
  })
})
