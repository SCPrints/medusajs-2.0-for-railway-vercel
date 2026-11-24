const load = (value: string | undefined): Date | null => {
  const before = process.env.MARKETING_EMAILS_SINCE
  if (value === undefined) delete process.env.MARKETING_EMAILS_SINCE
  else process.env.MARKETING_EMAILS_SINCE = value
  let out: Date | null = null
  jest.isolateModules(() => {
    out = require("../constants").MARKETING_EMAILS_SINCE
  })
  if (before === undefined) delete process.env.MARKETING_EMAILS_SINCE
  else process.env.MARKETING_EMAILS_SINCE = before
  return out
}

describe("MARKETING_EMAILS_SINCE", () => {
  it("unset or blank = no cutoff", () => {
    expect(load(undefined)).toBeNull()
    expect(load("  ")).toBeNull()
  })
  it("a real date is the cutoff", () => {
    expect(load("2026-10-23")?.toISOString()).toBe("2026-10-23T00:00:00.000Z")
  })
  it("a typo blocks everyone instead of emailing everyone", () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => undefined)
    const d = load("23/10/2026x")
    expect(d!.getTime()).toBe(8.64e15)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
