#!/usr/bin/env node
/**
 * Verifies that the storefront's mirror of `scp-dtf-print-pricing.ts` agrees
 * with the canonical backend version. Compares the shared rate-card data —
 * version, quantity tiers, print size options, the price matrix, A6-only
 * sides, and the default size — by regex-parsing both files.
 *
 * The storefront file has a few UI-only extras (`AllowedSizesContext`,
 * `getAllowedScpPrintSizesForSide`) that the backend doesn't need; the check
 * ignores those and only enforces parity on the pricing/data exports.
 *
 * Usage:
 *   node scripts/check-dtf-pricing-sync.mjs
 *
 * Exits non-zero on mismatch. Wire into CI to catch drift the next time
 * someone updates one file and forgets the other — this matters because the
 * same numbers also appear in the chatbot system prompt as prose, so a silent
 * drift here is a three-surface bug.
 */

import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

const BACKEND_PATH = resolve(repoRoot, "backend/src/lib/scp-dtf-print-pricing.ts")
const STOREFRONT_PATH = resolve(
  repoRoot,
  "storefront/src/modules/customizer/lib/scp-dtf-print-pricing.ts"
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

/** Extract a numeric/string literal: `const NAME ... = value`. */
function extractScalar(source, name) {
  const re = new RegExp(
    `const\\s+${name}\\s*(?::[^=]+)?\\s*=\\s*(["']?)([^"'\\s;]+)\\1\\s*(?:as\\s+const)?`,
    "m"
  )
  const m = source.match(re)
  if (!m) return null
  const raw = m[2]
  const asNum = Number(raw)
  return Number.isFinite(asNum) && /^-?\d/.test(raw) ? asNum : raw
}

/** Extract `new Set([...])` members as a sorted string array. */
function extractSetMembers(source, name) {
  const re = new RegExp(
    `const\\s+${name}\\s*(?::[^=]+)?\\s*=\\s*new\\s+Set[^[]*\\[([\\s\\S]*?)\\]`,
    "m"
  )
  const m = source.match(re)
  if (!m) return null
  return m[1]
    .split(",")
    .map((v) => v.trim().replace(/^["']|["']$/g, ""))
    .filter((v) => v.length > 0)
    .sort()
}

/**
 * Extract an array of `{ key: value, ... }` literals. Returns a normalised
 * array of plain objects (keys preserved, values coerced to number when
 * possible). Tolerant of trailing commas and whitespace.
 */
function extractObjectArray(source, name) {
  const re = new RegExp(
    `const\\s+${name}\\s*(?::[^=]+)?\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as\\s+const)?\\s*;?`,
    "m"
  )
  const m = source.match(re)
  if (!m) return null
  const body = m[1]
  const objects = []
  // Match top-level `{ ... }` literal bodies — naive but the rate-card files
  // don't nest object literals inside their arrays.
  const objRe = /\{([^{}]*)\}/g
  let om
  while ((om = objRe.exec(body)) !== null) {
    const inner = om[1]
    const obj = {}
    const fieldRe = /(?:["']?([\w-]+)["']?)\s*:\s*(?:(["'])([^"']*)\2|(-?\d+(?:\.\d+)?))/g
    let fm
    while ((fm = fieldRe.exec(inner)) !== null) {
      const key = fm[1]
      obj[key] = fm[2] !== undefined ? fm[3] : Number(fm[4])
    }
    if (Object.keys(obj).length > 0) {
      objects.push(obj)
    }
  }
  return objects.length ? objects : null
}

/**
 * Extract the SCP_PRINT_UNIT_MATRIX object — keys are size ids (snake_case
 * strings or bare identifiers), values are tuples of 5 numbers.
 */
function extractPriceMatrix(source, name) {
  const re = new RegExp(
    `const\\s+${name}\\s*(?::[^=]+)?\\s*=\\s*\\{([\\s\\S]*?)^\\s*\\}`,
    "m"
  )
  const m = source.match(re)
  if (!m) return null
  const body = m[1]
  // Each row: `key: [n, n, n, n, n]`
  const rowRe = /(?:["']?([\w-]+)["']?)\s*:\s*\[([^\]]+)\]/g
  const out = {}
  let rm
  while ((rm = rowRe.exec(body)) !== null) {
    const key = rm[1]
    const nums = rm[2]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
    if (nums.some((n) => !Number.isFinite(n))) {
      return null
    }
    out[key] = nums
  }
  return Object.keys(out).length ? out : null
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
  // Version pin — bumping on one side without the other is the classic drift.
  const backendVersion = extractScalar(backend, "SCP_PRINT_PRICING_VERSION")
  const storefrontVersion = extractScalar(storefront, "SCP_PRINT_PRICING_VERSION")
  if (backendVersion == null || storefrontVersion == null) {
    fail("Could not parse SCP_PRINT_PRICING_VERSION on one of the files.")
  } else {
    compare("SCP_PRINT_PRICING_VERSION", backendVersion, storefrontVersion)
  }

  // Default size — single string literal.
  const backendDefault = extractScalar(backend, "DEFAULT_SCP_PRINT_SIZE_ID")
  const storefrontDefault = extractScalar(storefront, "DEFAULT_SCP_PRINT_SIZE_ID")
  if (backendDefault == null || storefrontDefault == null) {
    fail("Could not parse DEFAULT_SCP_PRINT_SIZE_ID on one of the files.")
  } else {
    compare("DEFAULT_SCP_PRINT_SIZE_ID", backendDefault, storefrontDefault)
  }

  // Quantity tiers — labels + ranges drive the displayed brackets.
  const backendQty = extractObjectArray(backend, "SCP_BLANK_ALIGNED_QUANTITY_TIERS")
  const storefrontQty = extractObjectArray(storefront, "SCP_BLANK_ALIGNED_QUANTITY_TIERS")
  if (!backendQty || !storefrontQty) {
    fail("Could not parse SCP_BLANK_ALIGNED_QUANTITY_TIERS on one of the files.")
  } else {
    compare("SCP_BLANK_ALIGNED_QUANTITY_TIERS", backendQty, storefrontQty)
  }

  // Print-size options — id + label + dimensions caption.
  const backendSizes = extractObjectArray(backend, "SCP_PRINT_SIZE_OPTIONS")
  const storefrontSizes = extractObjectArray(storefront, "SCP_PRINT_SIZE_OPTIONS")
  if (!backendSizes || !storefrontSizes) {
    fail("Could not parse SCP_PRINT_SIZE_OPTIONS on one of the files.")
  } else {
    compare("SCP_PRINT_SIZE_OPTIONS", backendSizes, storefrontSizes)
  }

  // Price matrix — the load-bearing numbers.
  const backendMatrix = extractPriceMatrix(backend, "SCP_PRINT_UNIT_MATRIX")
  const storefrontMatrix = extractPriceMatrix(storefront, "SCP_PRINT_UNIT_MATRIX")
  if (!backendMatrix || !storefrontMatrix) {
    fail("Could not parse SCP_PRINT_UNIT_MATRIX on one of the files.")
  } else {
    compare("SCP_PRINT_UNIT_MATRIX", backendMatrix, storefrontMatrix)
  }

  // A6-only side restrictions.
  const backendA6 = extractSetMembers(backend, "SCP_A6_ONLY_SIDES")
  const storefrontA6 = extractSetMembers(storefront, "SCP_A6_ONLY_SIDES")
  if (!backendA6 || !storefrontA6) {
    fail("Could not parse SCP_A6_ONLY_SIDES on one of the files.")
  } else {
    compare("SCP_A6_ONLY_SIDES", backendA6, storefrontA6)
  }
}

if (failures.length === 0) {
  console.log("✓ scp-dtf-print-pricing.ts files are in sync")
  process.exit(0)
} else {
  console.error("✗ scp-dtf-print-pricing.ts files are OUT OF SYNC:\n")
  for (const f of failures) {
    console.error(`  - ${f}\n`)
  }
  console.error(
    "Edit both files together (backend canonical → storefront mirror) and re-run.\n" +
      "Remember: the chatbot system prompt at storefront/src/lib/chatbot/system-prompt.ts\n" +
      "ALSO carries DTF prices in prose — update that too when bumping the matrix."
  )
  process.exit(1)
}
