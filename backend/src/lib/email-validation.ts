/** Basic format check (same pattern as newsletter signup). */
export const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

/**
 * Trim, lowercase and strip invisible characters (zero-width spaces,
 * left-to-right marks, BOM). Gmail adds these when an address is copied,
 * and they pass isValidEmail. On 17 Nov 2026 one made a duplicate customer
 * and his emails failed to send.
 */
export const cleanEmail = (value: unknown) =>
  typeof value === "string"
    ? value.replace(/[​-‏‪-‮⁠﻿]/g, "").trim().toLowerCase()
    : ""
