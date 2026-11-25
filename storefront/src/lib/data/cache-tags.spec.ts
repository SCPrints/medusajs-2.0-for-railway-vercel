import { readdirSync, readFileSync } from "fs"
import { join } from "path"

// Since Next 16, revalidateTag(tag, "max") inside a server action does not
// refresh the page, so the customer never saw their own change (the cart bin
// spun forever, quantities and new addresses stayed stale until a reload).
// Data the customer has just changed must use updateTag instead.
describe("cart and customer cache tags", () => {
  it("are refreshed with updateTag, never revalidateTag", () => {
    const offenders = readdirSync(__dirname)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".spec.ts"))
      .filter((f) => /revalidateTag\(\s*"(cart|customer)"/.test(readFileSync(join(__dirname, f), "utf8")))
    expect(offenders).toEqual([])
  })
})
