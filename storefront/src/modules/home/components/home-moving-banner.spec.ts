import { movingBannerVisible } from "./home-moving-banner"

const DAY = 24 * 60 * 60 * 1000
const moveDateMs = Date.parse("2026-07-01T00:00:00+10:00")
const base = { moveDateMs, graceDays: 10, cooldownDays: 7 }

describe("movingBannerVisible", () => {
  it("shows before the move when never dismissed", () => {
    expect(
      movingBannerVisible({ ...base, now: moveDateMs - 5 * DAY, dismissedAt: null })
    ).toBe(true)
  })

  it("hides once past the move date plus grace", () => {
    expect(
      movingBannerVisible({ ...base, now: moveDateMs + 11 * DAY, dismissedAt: null })
    ).toBe(false)
  })

  it("still shows inside the grace window", () => {
    expect(
      movingBannerVisible({ ...base, now: moveDateMs + 9 * DAY, dismissedAt: null })
    ).toBe(true)
  })

  it("hides while a dismissal is still within cooldown", () => {
    const now = moveDateMs - 5 * DAY
    expect(
      movingBannerVisible({ ...base, now, dismissedAt: now - 2 * DAY })
    ).toBe(false)
  })

  it("re-shows after the cooldown lapses", () => {
    const now = moveDateMs - 5 * DAY
    expect(
      movingBannerVisible({ ...base, now, dismissedAt: now - 8 * DAY })
    ).toBe(true)
  })
})
