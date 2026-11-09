/**
 * When this browser last opened each job, so the board can mark cards where
 * the customer has done something since.
 */
// ponytail: kept in the browser, so it's per computer, not per staff login;
// move it to the admin-workspace module if people share machines.
const KEY = "sc:jobs_seen"

export type JobsSeen = { since: string; at: Record<string, string> }

export function readSeen(): JobsSeen {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null")
    if (v && typeof v.since === "string" && v.at && typeof v.at === "object") return v
  } catch {
    /* blocked or corrupt: start again */
  }
  // First visit: everything up to now counts as seen.
  return save({ since: new Date().toISOString(), at: {} })
}

export function markSeen(id: string): JobsSeen {
  const seen = readSeen()
  return save({ ...seen, at: { ...seen.at, [id]: new Date().toISOString() } })
}

export const isNewSince = (seen: JobsSeen, id: string, at: string | null | undefined) => !!at && at > (seen.at[id] ?? seen.since)

function save(seen: JobsSeen): JobsSeen {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen))
  } catch {
    /* private window: the dots just won't persist */
  }
  return seen
}
