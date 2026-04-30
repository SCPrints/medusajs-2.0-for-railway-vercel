/** Basic format check (same pattern as newsletter signup). */
export const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
