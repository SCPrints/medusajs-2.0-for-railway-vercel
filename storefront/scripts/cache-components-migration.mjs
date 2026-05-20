#!/usr/bin/env node
// One-shot script to add Cache Components compatibility to every page.tsx
// under app/[countryCode]/ that doesn't already opt in. Run once locally:
//   node storefront/scripts/cache-components-migration.mjs
//
// Strategy:
//   - Single-[countryCode] static pages: add `generateStaticParams` returning [{countryCode:"au"}]
//   - Multi-segment dynamic routes + auth pages: add `await connection()` at the body top
//
// Safe to re-run; skips pages that already have either marker.

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs"
import { join, relative } from "path"

const ROOT = new URL("../src/app/[countryCode]", import.meta.url).pathname

// Paths that are auth-dynamic regardless of segment count. Match by substring.
const DYNAMIC_PATH_FRAGMENTS = [
  "/(checkout)/checkout/",
  "/(main)/cart/",
  "/(main)/account/",
  "/(main)/order/confirmed/",
  "/(main)/artwork-approval/",
  "/(main)/quote-accept/",
  "/(main)/group-order/",
  "/(main)/results/",
  "/(main)/search/",
]

function listPageFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...listPageFiles(full))
    else if (entry === "page.tsx") out.push(full)
  }
  return out
}

function countDynamicSegments(path) {
  return (path.match(/\[/g) || []).length
}

function classify(filePath) {
  const rel = relative(ROOT, filePath).replace(/\\/g, "/")
  const full = "/" + rel
  // Auth pages first
  for (const frag of DYNAMIC_PATH_FRAGMENTS) {
    if (full.includes(frag)) return "dynamic"
  }
  // Multi-segment routes (more than just [countryCode]): also dynamic for now
  if (countDynamicSegments(rel) > 0) return "dynamic"
  // Pure [countryCode] route under app/[countryCode]/... → static stub
  return "static"
}

function alreadyCompatible(src) {
  return (
    /generateStaticParams\s*\(/.test(src) ||
    /await\s+connection\s*\(/.test(src)
  )
}

function applyStaticFix(src) {
  // Inject generateStaticParams after the last top-level import block.
  // Place after the metadata export if present; otherwise after imports.
  const insertion = `\nexport async function generateStaticParams() {\n  return [{ countryCode: "au" }]\n}\n`
  // Find the last import statement
  const importRegex = /^import[\s\S]+?from\s+["'][^"']+["']\s*;?\s*$/gm
  let lastImportEnd = 0
  let m
  while ((m = importRegex.exec(src)) !== null) {
    lastImportEnd = m.index + m[0].length
  }
  if (lastImportEnd === 0) {
    // No imports — prepend.
    return insertion + src
  }
  return src.slice(0, lastImportEnd) + "\n" + insertion + src.slice(lastImportEnd)
}

function applyDynamicFix(src) {
  // Need to:
  //  1. Add `import { connection } from "next/server"` if not present.
  //  2. Make the page export `async`.
  //  3. Insert `await connection()` as first statement in the page body.
  // We detect the default export's body and modify it.
  let out = src

  // 1. Import (skip if already imported from next/server)
  if (!/from\s+["']next\/server["']/.test(out)) {
    // Inject after first import line
    const m = out.match(/^import[^\n]+\n/m)
    if (m) {
      out = out.slice(0, m.index + m[0].length) +
        `import { connection } from "next/server"\n` +
        out.slice(m.index + m[0].length)
    } else {
      out = `import { connection } from "next/server"\n` + out
    }
  } else if (!/import\s*\{[^}]*\bconnection\b[^}]*\}\s*from\s+["']next\/server["']/.test(out)) {
    // next/server is imported but connection isn't — add it to the existing import
    out = out.replace(
      /import\s*\{([^}]+)\}\s*from\s+["']next\/server["']/,
      (full, members) => `import { connection,${members}} from "next/server"`
    )
  }

  // 2 + 3. Find the default export function and inject `await connection()` after the opening brace.
  // Match: export default (async )?function NAME(...) { ... }
  const fnRegex = /(export\s+default\s+)(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(:\s*[^\{]+)?\{/
  const fm = out.match(fnRegex)
  if (fm) {
    const [match, prefix, asyncKw, name, params, retType = ""] = fm
    const start = out.indexOf(match)
    const endOfMatch = start + match.length
    // Ensure async
    const newSig = `${prefix}async function ${name}(${params})${retType}{`
    const before = out.slice(0, start)
    const after = out.slice(endOfMatch)
    // Inject await connection() as first body statement
    out = before + newSig + `\n  await connection()` + after
  } else {
    // Last resort: prepend a comment so we notice
    out = `// TODO: cache-components-migration could not auto-add await connection()\n` + out
  }

  return out
}

function main() {
  const files = listPageFiles(ROOT)
  let touched = 0
  let staticCount = 0
  let dynamicCount = 0
  let skipped = 0

  for (const file of files) {
    const src = readFileSync(file, "utf8")
    if (alreadyCompatible(src)) {
      skipped++
      continue
    }
    const kind = classify(file)
    const next = kind === "static" ? applyStaticFix(src) : applyDynamicFix(src)
    if (next !== src) {
      writeFileSync(file, next)
      touched++
      if (kind === "static") staticCount++
      else dynamicCount++
      console.log(`  [${kind}] ${relative(ROOT, file)}`)
    }
  }

  console.log(`\nDone: ${touched} files touched (${staticCount} static, ${dynamicCount} dynamic), ${skipped} already compatible.`)
}

main()
