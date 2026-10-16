import { addBusinessDays, businessDaysBetween, isStudioWeekend, studioDate } from "../business-days"

// 2026-10-12 is a Monday. Times are mid-morning Sydney (UTC+11 in October).
const syd = (ymd: string, hour = 10) =>
  new Date(`${ymd}T${String(hour).padStart(2, "0")}:00:00+11:00`)

describe("business days", () => {
  it("reads the calendar date in Sydney, not UTC", () => {
    // 08:00 Tuesday in Sydney is still Monday in UTC.
    expect(studioDate(syd("2026-10-13", 8))).toBe("2026-10-13")
  })

  it("counts weekdays started since the start date", () => {
    expect(businessDaysBetween(syd("2026-10-12"), syd("2026-10-12", 17))).toBe(0)
    expect(businessDaysBetween(syd("2026-10-12"), syd("2026-10-14"))).toBe(2)
  })

  it("skips the weekend", () => {
    // Friday → Monday is 1, Friday → Tuesday is 2.
    expect(businessDaysBetween(syd("2026-10-16"), syd("2026-10-19"))).toBe(1)
    expect(businessDaysBetween(syd("2026-10-16"), syd("2026-10-20"))).toBe(2)
  })

  it("adds business days across a weekend", () => {
    expect(addBusinessDays(syd("2026-10-12"), 7)).toBe("2026-10-21")
    expect(addBusinessDays(syd("2026-10-16"), 1)).toBe("2026-10-19")
  })

  it("knows a Sydney Saturday", () => {
    expect(isStudioWeekend(syd("2026-10-17"))).toBe(true)
    expect(isStudioWeekend(syd("2026-10-19"))).toBe(false)
  })
})
