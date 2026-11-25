/**
 * Medusa (2.22) merges `metadata` on every module update: a key left out is
 * KEPT, and only a key sent as "" is removed (mergeMetadata in
 * @medusajs/utils). So "delete meta.x, then update" silently does nothing.
 *
 * Give this the metadata as it was and as it should be now; it returns the
 * update that gets there: changed or new keys, and every removed key as "".
 * Keys that didn't change are left out, so a write made meanwhile by someone
 * else (a stage change, a stamp) is not put back. Pure, admin-safe.
 */
export function metadataPatch(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>
): Record<string, unknown> {
  const old = before ?? {}
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(after)) {
    if (!(key in old) || JSON.stringify(old[key]) !== JSON.stringify(value)) patch[key] = value
  }
  for (const key of Object.keys(old)) {
    if (!(key in after)) patch[key] = ""
  }
  return patch
}
