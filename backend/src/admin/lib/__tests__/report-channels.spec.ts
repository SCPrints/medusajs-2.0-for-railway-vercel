import { channelFor, groupChannels } from "../reports/channels"

describe("channelFor", () => {
  it.each([
    ["(direct)", "(none)", "Direct"],
    ["google", "organic", "Google search"],
    ["bing", "organic", "Other search"],
    ["chatgpt.com", "ai-assistant", "AI assistants"],
    ["chatgpt.com", "organic", "AI assistants"],
    ["chatgpt.com", "(none)", "AI assistants"],
    ["email", "transactional", "Email"],
    ["ig", "social", "Social"],
    ["calso.com.au", "referral", "Referral"],
    ["upload", "(not set)", "Unknown"],
    ["(not set)", "(not set)", "Unknown"],
    ["google", "cpc", "Paid ads"],
    ["mystery", "newsletter", "Other"],
  ])("%s / %s is %s", (source, medium, expected) => {
    expect(channelFor(source, medium)).toBe(expected)
  })
})

describe("groupChannels", () => {
  const row = (source: string, medium: string, sessions: number, engaged: number) => ({
    source,
    medium,
    sessions,
    engaged_sessions: engaged,
  })

  it("merges rows into channels, joins sales by source + medium, sorts by sessions", () => {
    const result = groupChannels(
      [
        row("google", "organic", 185, 133),
        row("chatgpt.com", "ai-assistant", 130, 89),
        row("chatgpt.com", "organic", 17, 13),
        row("(direct)", "(none)", 796, 124),
      ],
      [
        { source: "chatgpt.com", medium: "organic", add_to_carts: 2, purchases: 1, revenue: 50.5 },
        { source: "chatgpt.com", medium: "ai-assistant", add_to_carts: 1, purchases: 1, revenue: 100 },
      ]
    )

    expect(result.map((c) => c.channel)).toEqual(["Direct", "Google search", "AI assistants"])
    expect(result[2]).toMatchObject({
      sessions: 147,
      engaged_sessions: 102,
      add_to_carts: 3,
      purchases: 2,
      revenue: 150.5,
    })
    expect(result[2].sources).toHaveLength(2)
    expect(result[1]).toMatchObject({ purchases: 0, revenue: 0 })
  })
})
