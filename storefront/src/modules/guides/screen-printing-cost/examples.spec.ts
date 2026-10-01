import {
  SCP_SCREEN_QUANTITY_TIERS,
  SCREEN_SETUP_PER_SCREEN_MAJOR,
} from "@modules/customizer/lib/scp-screen-print-pricing"

import { dtfJobCost, screenBreakEvenQuantity, screenJobCost } from "./examples"

describe("screen printing cost guide examples", () => {
  it("adds one setup screen per colour, plus the underbase on dark garments", () => {
    const light = screenJobCost({ quantity: 50, colours: 2 })
    const dark = screenJobCost({ quantity: 50, colours: 2, darkGarment: true })
    expect(light.screens).toBe(2)
    expect(dark.screens).toBe(3)
    expect(light.setup).toBe(2 * SCREEN_SETUP_PER_SCREEN_MAJOR)
    expect(light.total).toBe(
      SCP_SCREEN_QUANTITY_TIERS[1].prices[1] * 50 + 2 * SCREEN_SETUP_PER_SCREEN_MAJOR
    )
  })

  it("break-even is the first quantity where screen undercuts DTF, and not before", () => {
    const design = { colours: 1 }
    const q = screenBreakEvenQuantity(design, "up_to_a4")
    expect(q).not.toBeNull()
    const at = (n: number) =>
      screenJobCost({ ...design, quantity: n }).total - dtfJobCost(n, "up_to_a4").total
    expect(at(q!)).toBeLessThan(0)
    if (q! > 25) expect(at(q! - 1)).toBeGreaterThanOrEqual(0)
  })
})
