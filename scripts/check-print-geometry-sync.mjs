#!/usr/bin/env node
/**
 * Verifies the backend mirror of the Studio's size maths
 * (backend/src/lib/print-geometry.ts) agrees with the storefront original
 * (storefront/src/modules/customizer/lib/print-geometry.ts): print-area
 * ratios, frame aspect, guide sizes, mockup origin, tag zoom. Regex over the
 * constant declarations — not a TS evaluator.
 *
 * Usage: node scripts/check-print-geometry-sync.mjs   (exits non-zero on drift)
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const files = {
  storefront: resolve(root, "storefront/src/modules/customizer/lib/print-geometry.ts"),
  backend: resolve(root, "backend/src/lib/print-geometry.ts"),
}

const NAMES = ["PRINT_AREA_W_RATIO", "PRINT_AREA_H_RATIO", "FRAME_ASPECT", "PRINT_SIZE_REF_CM", "MOCKUP_SCALE_ORIGIN", "TAG_ZOOM"]

const constants = (path) => {
  const src = readFileSync(path, "utf8")
  const out = {}
  for (const name of NAMES) {
    // `export const NAME[: type] = <value>` up to the end of the statement.
    const m = src.match(new RegExp(`export const ${name}\\b[^=]*=\\s*([\\s\\S]*?)\\n(?=\\n|export|/\\*\\*)`))
    out[name] = m ? m[1].replace(/\/\/.*$/gm, "").replace(/\s+/g, "") : null
  }
  return out
}

const a = constants(files.storefront)
const b = constants(files.backend)
const failures = NAMES.filter((n) => a[n] === null || b[n] === null || a[n] !== b[n])

if (failures.length) {
  for (const n of failures) console.error(`✗ ${n}\n    storefront: ${a[n]}\n    backend:    ${b[n]}`)
  console.error("\nprint-geometry is out of sync — change both files together.")
  process.exit(1)
}
console.log(`✓ print-geometry in sync (${NAMES.length} constants)`)
