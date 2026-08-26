#!/usr/bin/env node
/**
 * Verifies the storefront mirror of `scp-supacolour-pricing.ts` agrees with
 * the canonical backend version. The two files are identical except for their
 * header comment, so the check strips comments and compares the remaining
 * source verbatim — any drift in tiers, prices, fees, or logic fails.
 *
 * Usage: node scripts/check-screen-pricing-sync.mjs   (part of `pnpm check-sync`)
 */

import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

const BACKEND_PATH = resolve(repoRoot, "backend/src/lib/scp-supacolour-pricing.ts")
const STOREFRONT_PATH = resolve(
  repoRoot,
  "storefront/src/modules/customizer/lib/scp-supacolour-pricing.ts"
)

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()

let backend, storefront
try {
  backend = stripComments(readFileSync(BACKEND_PATH, "utf8"))
  storefront = stripComments(readFileSync(STOREFRONT_PATH, "utf8"))
} catch (err) {
  console.error(`✗ supacolour-pricing sync check: cannot read file — ${err.message}`)
  process.exit(1)
}

if (backend !== storefront) {
  console.error(
    "✗ scp-supacolour-pricing.ts files are OUT OF SYNC.\n" +
      `  backend:    ${BACKEND_PATH}\n` +
      `  storefront: ${STOREFRONT_PATH}\n` +
      "  Edit the backend file first, then copy the change to the mirror (only the header comment may differ)."
  )
  process.exit(1)
}

console.log("✓ scp-supacolour-pricing.ts files are in sync")
