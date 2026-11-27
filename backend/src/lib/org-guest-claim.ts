/**
 * Staff can add someone to an organisation before they have a login: the
 * member is then a guest customer record. Signing up makes a separate account
 * (Medusa never merges the two), so the memberships have to move across once
 * the account's email is confirmed. This decides which ones move.
 */
export type ClaimableMembership = { id: string; organisation_id: string; customer_id: string }

/** One per organisation, and never one the account already belongs to. */
export function planGuestMembershipClaim(
  guestMemberships: ClaimableMembership[],
  accountOrganisationIds: Iterable<string>
): ClaimableMembership[] {
  const taken = new Set(accountOrganisationIds)
  const moves: ClaimableMembership[] = []
  for (const m of guestMemberships) {
    if (!m?.id || !m.organisation_id || taken.has(m.organisation_id)) continue
    taken.add(m.organisation_id)
    moves.push(m)
  }
  return moves
}
