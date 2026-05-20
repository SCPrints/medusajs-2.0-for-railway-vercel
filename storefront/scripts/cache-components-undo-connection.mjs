#!/usr/bin/env node
// Reverses the `await connection()` additions made by cache-components-migration.mjs.
// Per Next 16 docs (https://nextjs.org/docs/messages/blocking-route), calling
// `connection()` IS itself a trigger of the blocking-route error — adding it
// as a "dynamic opt-out" was wrong. Instead, dynamic data access should be
// wrapped in <Suspense> at the layout level (now done in (main)/layout.tsx
// and (checkout)/layout.tsx).

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs"
import { join, relative } from "path"

const ROOT = new URL("../src/app", import.meta.url).pathname

function listPageFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...listPageFiles(full))
    else if (entry === "page.tsx" || entry === "layout.tsx") out.push(full)
  }
  return out
}

function undo(src) {
  let out = src
  let changed = false

  // 1. Remove `await connection()` lines
  const beforeConn = out
  out = out.replace(/\s*await\s+connection\s*\(\s*\)\s*\n?/g, (m) => {
    // Preserve indentation if the line had only the connection call
    return ""
  })
  if (out !== beforeConn) changed = true

  // 2. Remove `import { connection } from "next/server"` lines (alone)
  const beforeImport = out
  out = out.replace(
    /^import\s*\{\s*connection\s*\}\s*from\s+["']next\/server["']\s*;?\s*\n/gm,
    ""
  )
  if (out !== beforeImport) changed = true

  // 3. Strip `connection,` from combined imports of next/server
  out = out.replace(
    /import\s*\{\s*connection\s*,\s*([^}]+)\}\s*from\s+["']next\/server["']/g,
    (full, members) => `import { ${members.trim()} } from "next/server"`
  )
  out = out.replace(
    /import\s*\{\s*([^}]+?)\s*,\s*connection\s*\}\s*from\s+["']next\/server["']/g,
    (full, members) => `import { ${members.trim()} } from "next/server"`
  )

  return { out, changed }
}

function main() {
  const files = listPageFiles(ROOT)
  let touched = 0
  for (const file of files) {
    const src = readFileSync(file, "utf8")
    const { out, changed } = undo(src)
    if (changed) {
      writeFileSync(file, out)
      touched++
      console.log(`  reverted: ${relative(ROOT, file)}`)
    }
  }
  console.log(`\nDone: ${touched} files reverted`)
}

main()
