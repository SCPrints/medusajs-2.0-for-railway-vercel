/**
 * Rolls GA4's source/medium rows up into the channels staff actually think in,
 * so "chatgpt.com / ai-assistant", "chatgpt.com / organic" and
 * "chatgpt.com / (none)" read as one line.
 */

export type EngagementRow = {
  source: string
  medium: string
  sessions: number
  engaged_sessions: number
}

export type EcommerceRow = {
  source: string
  medium: string
  add_to_carts: number
  purchases: number
  revenue: number
}

export type SourceRow = EngagementRow & {
  add_to_carts: number
  purchases: number
  revenue: number
}

export type ChannelRow = {
  channel: string
  sessions: number
  engaged_sessions: number
  add_to_carts: number
  purchases: number
  revenue: number
  sources: SourceRow[]
}

const AI_SOURCE = /chatgpt|openai|perplexity|claude|anthropic|gemini|copilot/
const SOCIAL_SOURCE = /^(ig|instagram|facebook|fb|linkedin|tiktok|pinterest|youtube)\b/

export const channelFor = (source: string, medium: string): string => {
  const s = source.toLowerCase()
  const m = medium.toLowerCase()
  if (s === "(direct)") return "Direct"
  // Before the organic check: GA4 also reports chatgpt.com as "organic".
  if (AI_SOURCE.test(s) || m === "ai-assistant") return "AI assistants"
  if (/cpc|ppc|paid/.test(m)) return "Paid ads"
  if (m === "organic") return s === "google" ? "Google search" : "Other search"
  if (s === "email" || m === "email" || m === "transactional") return "Email"
  if (m === "social" || SOCIAL_SOURCE.test(s)) return "Social"
  if (m === "referral") return "Referral"
  if (m === "(not set)") return "Unknown"
  return "Other"
}

/** Both inputs are GA4 source/medium reports for the same date range. */
export const groupChannels = (
  engagement: EngagementRow[],
  ecommerce: EcommerceRow[]
): ChannelRow[] => {
  const salesByKey = new Map(ecommerce.map((r) => [`${r.source}|${r.medium}`, r]))
  const channels = new Map<string, ChannelRow>()

  for (const row of engagement) {
    const sales = salesByKey.get(`${row.source}|${row.medium}`)
    const source: SourceRow = {
      source: row.source,
      medium: row.medium,
      sessions: row.sessions,
      engaged_sessions: row.engaged_sessions,
      add_to_carts: sales?.add_to_carts ?? 0,
      purchases: sales?.purchases ?? 0,
      revenue: sales?.revenue ?? 0,
    }
    const name = channelFor(row.source, row.medium)
    const channel = channels.get(name) ?? {
      channel: name,
      sessions: 0,
      engaged_sessions: 0,
      add_to_carts: 0,
      purchases: 0,
      revenue: 0,
      sources: [],
    }
    channel.sessions += source.sessions
    channel.engaged_sessions += source.engaged_sessions
    channel.add_to_carts += source.add_to_carts
    channel.purchases += source.purchases
    channel.revenue += source.revenue
    channel.sources.push(source)
    channels.set(name, channel)
  }

  return [...channels.values()].sort((a, b) => b.sessions - a.sessions)
}
