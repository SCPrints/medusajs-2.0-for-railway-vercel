/** Calls made before the lazily-loaded SDK arrives must not be lost. */
describe("posthog wrapper", () => {
  const load = () => {
    jest.resetModules()
    return require("./posthog") as typeof import("./posthog")
  }
  const sdk = () => ({ capture: jest.fn(), identify: jest.fn() })

  beforeEach(() => {
    ;(global as any).window = {}
  })
  afterEach(() => {
    delete (global as any).window
  })

  it("replays early calls once, in order, then sends straight through", () => {
    const { phCapture, phCapturePageView, phStart } = load()
    const posthog = sdk()
    phCapturePageView("/au/store")
    phCapture("early")
    phStart(posthog as any)
    phCapture("late")
    expect(posthog.capture.mock.calls.map(([event]) => event)).toEqual(["$pageview", "early", "late"])
  })

  it("drops calls when analytics is off", () => {
    const { phCapture, phStart } = load()
    phCapture("staff browser")
    phStart(null)
    const posthog = sdk()
    phStart(posthog as any)
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it("caps the queue", () => {
    const { phCapture, phStart } = load()
    const posthog = sdk()
    for (let i = 0; i < 150; i++) phCapture("event")
    phStart(posthog as any)
    expect(posthog.capture).toHaveBeenCalledTimes(100)
  })

  it("never throws from a failing SDK call", () => {
    const { phCapture, phStart } = load()
    const posthog = sdk()
    posthog.capture.mockImplementation(() => {
      throw new Error("boom")
    })
    phStart(posthog as any)
    expect(() => phCapture("event")).not.toThrow()
  })
})
