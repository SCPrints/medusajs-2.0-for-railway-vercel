export const NON_TRACKED_VARIANT_DEFAULTS = {
  manage_inventory: false,
  allow_backorder: true,
} as const

export const withNonTrackedInventoryDefaults = <T extends Record<string, unknown>>(
  input: T
) => ({
  ...input,
  ...NON_TRACKED_VARIANT_DEFAULTS,
})
