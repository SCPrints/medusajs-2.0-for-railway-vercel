/**
 * The address a POS sale with no customer details lands on. Medusa needs an
 * email on the order, but nobody is reading it for that sale's progress.
 */
export const walkInEmail = (): string => process.env.POS_WALKIN_EMAIL ?? "walkin@scprints.com.au"

export const isWalkInEmail = (email: string | null | undefined): boolean =>
  !!email && email.trim().toLowerCase() === walkInEmail().trim().toLowerCase()
