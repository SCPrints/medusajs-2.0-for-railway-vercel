/**
 * Address the automated Studio test suite (storefront/e2e-studio) uses for the
 * data it creates. Staff notifications are skipped for it so every CI run
 * doesn't land in the shop inbox. Keep in sync with TEST_EMAIL in
 * storefront/e2e-studio/helpers.ts.
 */
export const STUDIO_TEST_EMAIL = "studio-tests@scprints.com.au"

export const isStudioTestEmail = (email: string | null | undefined) =>
  (email ?? "").trim().toLowerCase() === STUDIO_TEST_EMAIL
