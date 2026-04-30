/** Comma-separated notification inboxes (trimmed, lowercased). */
export function parseNotificationEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return []
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}
