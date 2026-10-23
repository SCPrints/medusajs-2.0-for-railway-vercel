import { leadDaysFor, planDueDateOnApproval } from "../production-due-date"

describe("leadDaysFor", () => {
  const lead = { standard: 7, priority: 3, express: 1 }
  it("uses the rush tier sold on the order, else standard", () => {
    expect(leadDaysFor({}, lead)).toBe(7)
    expect(leadDaysFor({ rush_tier: "priority" }, lead)).toBe(3)
    expect(leadDaysFor({ rush_tier: "express" }, lead)).toBe(1)
    expect(leadDaysFor({ rush_tier: "nonsense" }, lead)).toBe(7)
  })
})

// Approved Monday 12 Oct 2026, 11:00 Sydney.
const approved = new Date("2026-10-12T00:00:00.000Z")

describe("planDueDateOnApproval", () => {
  it("sets approval + lead time when there's no due date", () => {
    expect(planDueDateOnApproval({}, approved, 7)).toEqual({
      action: "set",
      due_date: "2026-10-21",
    })
  })

  it("moves a date set by an earlier approval", () => {
    expect(
      planDueDateOnApproval(
        { production_due_date: "2026-10-15", production_due_date_source: "auto" },
        approved,
        7
      )
    ).toEqual({ action: "set", due_date: "2026-10-21" })
  })

  it("keeps a date staff typed in and flags it when tight", () => {
    expect(
      planDueDateOnApproval(
        { production_due_date: "2026-10-15", production_due_date_source: "manual" },
        approved,
        7
      )
    ).toEqual({ action: "keep_manual", due_date: "2026-10-15", tight: true })
  })

  it("treats older dates with no source as staff-entered", () => {
    expect(planDueDateOnApproval({ production_due_date: "2026-11-30" }, approved, 7)).toEqual({
      action: "keep_manual",
      due_date: "2026-11-30",
      tight: false,
    })
  })
})
