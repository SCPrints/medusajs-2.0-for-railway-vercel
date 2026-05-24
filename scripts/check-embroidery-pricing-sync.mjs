#!/usr/bin/env node
/**
 * Verifies that the backend's `embroidery-pricing.ts` and the storefront's
 * `modules/embroidery/lib/pricing.ts` carry identical numeric rate-card data
 * — quantity tiers, the 10 stitch-tier rows (3,000–12,000), the digitizing
 * fee, and the auto-priced cap.
 *
 * The storefront file models additional concepts the backend doesn't need
 * (POA row, incremental row, full PricingConfig with id/label/minimumQuantity).
 * This check IGNORES those — POA rows (empty `prices: []`) are filtered out
 * before comparing, and only the load-bearing numbers are enforced equal.
 *
 * Usage:
 *   node scripts/check-embroidery-pricing-sync.mjs
 *
 * Exits non-zero on mismatch.
 */

import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

const BACKEND_PATH = resolve(repoRoot, "backend/src/lib/embroidery-pricing.ts")
const STOREFRONT_PATH = resolve(
  repoRoot,
  "storefront/src/modules/embroidery/lib/pricing.ts"
)

const failures = []

function fail(msg) {
  failures.push(msg)
}

function readFile(path, label) {
  try {
    return readFileSync(path, "utf8")
  } catch (err) {
    fail(`${label}: cannot read ${path} — ${err.message}`)
    return null
  }
}

/** Extract a numeric scalar `const NAME ... = 12345`. */
function extractNumber(source, name) {
  const re = new RegExp(
    `const\\s+${name}\\s*(?::[^=]+)?\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\b`,
    "m"
  )
  const m = source.match(re)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * Extract the QUANTITY_TIERS array of `{ minQuantity: N, label: "..." }`.
 * Returns a normalised array sorted by source order.
 */
function extractQuantityTiers(source) {
  const re = /const\s+QUANTITY_TIERS\s*(?::[^=]+)?\s*=\s*\[([\s\S]*?)\]/m
  const m = source.match(re)
  if (!m) return null
  const body = m[1]
  const rows = []
  const rowRe =
    /\{\s*minQuantity\s*:\s*(\d+)\s*,\s*label\s*:\s*["']([^"']+)["']\s*,?\s*\}/g
  let rm
  while ((rm = rowRe.exec(body)) !== null) {
    rows.push({ minQuantity: Number(rm[1]), label: rm[2] })
  }
  return rows.length ? rows : null
}

/**
 * Extract STITCH_TIERS as a list of `{ maxStitches, prices: [...] }` rows.
 * Filters out POA rows (those with `prices: []`, `maxStitches: null`, or an
 * `isPoaRow: true` flag) so the comparison focuses on the numeric tiers
 * shared by both files.
 */
function extractStitchTiers(source) {
  const re = /const\s+STITCH_TIERS\s*(?::[^=]+)?\s*=\s*\[([\s\S]*?)\]\s*(?:as\s+const)?\s*;?\s*$/m
  const m = source.match(re)
  if (!m) {
    // Fallback: look for the assignment without requiring end-of-line.
    const fallback = /const\s+STITCH_TIERS\s*(?::[^=]+)?\s*=\s*\[([\s\S]*?)\n\]/m
    const fm = source.match(fallback)
    if (!fm) return null
    return parseStitchTierBody(fm[1])
  }
  return parseStitchTierBody(m[1])
}

function parseStitchTierBody(body) {
  const rows = []
  const rowRe = /\{([^{}]*?)\}/g
  let rm
  while ((rm = rowRe.exec(body)) !== null) {
    const inner = rm[1]
    const maxMatch = inner.match(/maxStitches\s*:\s*(null|-?\d+)/)
    const pricesMatch = inner.match(/prices\s*:\s*\[([^\]]*)\]/)
    const poaMatch = inner.match(/isPoaRow\s*:\s*(true|false)/)
    if (!maxMatch || !pricesMatch) continue
    const isPoa = poaMatch && poaMatch[1] === "true"
    const maxRaw = maxMatch[1]
    const prices = pricesMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
    if (isPoa || maxRaw === "null" || prices.length === 0) {
      // POA / placeholder row — skip; the backend doesn't model these.
      continue
    }
    if (prices.some((n) => !Number.isFinite(n))) continue
    rows.push({ maxStitches: Number(maxRaw), prices })
  }
  return rows.length ? rows : null
}

/**
 * Extract the digitizing fee. Backend exposes `DIGITIZING_FEE_MAJOR = 60`
 * at module scope; storefront exposes the same value as
 * `digitizingFee: 60` inside STANDARD_CONFIG. Try the simpler form first,
 * fall back to the in-config form.
 */
function extractDigitizingFee(source) {
  const direct = extractNumber(source, "DIGITIZING_FEE_MAJOR")
  if (direct != null) return direct
  const inConfig = source.match(/digitizingFee\s*:\s*(\d+(?:\.\d+)?)/)
  if (inConfig) {
    const n = Number(inConfig[1])
    return Number.isFinite(n) ? n : null
  }
  return null
}

function compare(label, a, b) {
  const aJson = JSON.stringify(a)
  const bJson = JSON.stringify(b)
  if (aJson !== bJson) {
    fail(`${label} differs:\n  backend:    ${aJson}\n  storefront: ${bJson}`)
  }
}

const backend = readFile(BACKEND_PATH, "backend")
const storefront = readFile(STOREFRONT_PATH, "storefront")

if (backend && storefront) {
  // Quantity tiers — drive the 6 columns of the price grid.
  const backendQty = extractQuantityTiers(backend)
  const storefrontQty = extractQuantityTiers(storefront)
  if (!backendQty || !storefrontQty) {
    fail("Could not parse QUANTITY_TIERS on one of the files.")
  } else {
    compare("QUANTITY_TIERS", backendQty, storefrontQty)
  }

  // Stitch tiers — the 10 numeric rows (3k–12k). POA rows filtered.
  const backendStitch = extractStitchTiers(backend)
  const storefrontStitch = extractStitchTiers(storefront)
  if (!backendStitch || !storefrontStitch) {
    fail("Could not parse STITCH_TIERS on one of the files.")
  } else {
    compare("STITCH_TIERS (numeric rows only)", backendStitch, storefrontStitch)
  }

  // Digitizing fee.
  const backendFee = extractDigitizingFee(backend)
  const storefrontFee = extractDigitizingFee(storefront)
  if (backendFee == null || storefrontFee == null) {
    fail("Could not parse digitizing fee on one of the files.")
  } else {
    compare("digitizing fee", backendFee, storefrontFee)
  }

  // Auto-priced cap. Drift here would mean one side accepts a stitch count
  // the other rejects — silently breaks the quote handoff.
  const backendCap = extractNumber(backend, "MAX_AUTO_PRICED_STITCHES")
  const storefrontCap = extractNumber(storefront, "MAX_AUTO_PRICED_STITCHES")
  if (backendCap == null || storefrontCap == null) {
    fail("Could not parse MAX_AUTO_PRICED_STITCHES on one of the files.")
  } else {
    compare("MAX_AUTO_PRICED_STITCHES", backendCap, storefrontCap)
  }

  // EMBROIDERY_PRICING_VERSION — backend only declares it, but if storefront
  // ever adds one we should keep them in lockstep. Soft compare.
  const backendVer = extractNumber(backend, "EMBROIDERY_PRICING_VERSION")
  const storefrontVer = extractNumber(storefront, "EMBROIDERY_PRICING_VERSION")
  if (backendVer != null && storefrontVer != null) {
    compare("EMBROIDERY_PRICING_VERSION", backendVer, storefrontVer)
  }

  // Sanity: the highest backend tier should match the highest non-POA
  // storefront tier — the regex above already filters POA, so this guards
  // against silent truncation if the parser misses a row.
  if (backendStitch && storefrontStitch) {
    const backendMax = backendStitch[backendStitch.length - 1]?.maxStitches
    const storefrontMax = storefrontStitch[storefrontStitch.length - 1]?.maxStitches
    if (backendMax !== storefrontMax) {
      fail(
        `Highest numeric stitch tier differs: backend max=${backendMax} vs storefront max=${storefrontMax}`
      )
    }
  }
}

if (failures.length === 0) {
  console.log("✓ embroidery-pricing.ts files are in sync")
  process.exit(0)
} else {
  console.error("✗ embroidery-pricing.ts files are OUT OF SYNC:\n")
  for (const f of failures) {
    console.error(`  - ${f}\n`)
  }
  console.error(
    "Edit both files together (backend ↔ storefront) and re-run.\n" +
      "Remember: the chatbot system prompt at storefront/src/lib/chatbot/system-prompt.ts\n" +
      "ALSO carries embroidery prices in prose ($25 digitizing, etc.) — update there too."
  )
  process.exit(1)
}
