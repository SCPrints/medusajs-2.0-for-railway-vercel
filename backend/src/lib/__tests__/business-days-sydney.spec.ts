import { studioDate, studioDayStart, studioHourAndDay } from "../business-days"

describe("studio time", () => {
  it("buckets a UTC evening into the next Sydney day", () => {
    // 21 Oct 23:10 UTC is 22 Oct 10:10 in Sydney (AEDT, +11).
    const at = new Date("2026-10-21T23:10:00Z")
    expect(studioDate(at)).toBe("2026-10-22")
    expect(studioHourAndDay(at)).toEqual({ hour: 10, weekday: 4 })
  })

  it("follows daylight saving", () => {
    expect(studioHourAndDay(new Date("2026-07-01T02:00:00Z")).hour).toBe(12) // AEST, +10
    expect(studioHourAndDay(new Date("2026-12-01T02:00:00Z")).hour).toBe(13) // AEDT, +11
  })

  it("finds the instant a day starts, either side of the change", () => {
    expect(studioDayStart("2026-07-01").toISOString()).toBe("2026-06-30T14:00:00.000Z")
    expect(studioDayStart("2026-12-01").toISOString()).toBe("2026-11-30T13:00:00.000Z")
    // Clocks go forward at 2am on 4 Oct 2026, so midnight is still +10.
    expect(studioDayStart("2026-10-04").toISOString()).toBe("2026-10-03T14:00:00.000Z")
    expect(studioDayStart("2026-10-05").toISOString()).toBe("2026-10-04T13:00:00.000Z")
  })
})
