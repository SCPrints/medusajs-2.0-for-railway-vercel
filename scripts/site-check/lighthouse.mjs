#!/usr/bin/env node
// Lighthouse (mobile) performance check on the key pages of the live storefront.
//
//   node scripts/site-check/lighthouse.mjs [baseUrl]   (default https://www.scprints.com.au)
//
// Flags a page when it lands in Google's "poor" band for LCP or CLS. The
// overall score is reported but never fails the run — it swings ±10 between
// runs on shared CI machines. Writes site-check-lighthouse.md (+ job summary)
// and exits 1 when anything is flagged.

import { execFileSync } from "node:child_process"
import { appendFileSync, writeFileSync } from "node:fs"

const BASE = (process.argv[2] || "https://www.scprints.com.au").replace(/\/$/, "")
const PAGES = {
  Home: "/au",
  Store: "/au/store",
  Category: "/au/categories/mens-t-shirts",
  "Product (Studio)": "/au/products/as-colour-staple-tee-5001",
  Contact: "/au/contact",
}
// Google's "poor" thresholds.
const POOR_LCP_MS = 4000
const POOR_CLS = 0.25

function lighthouse(url) {
  const out = execFileSync(
    "npx",
    [
      "--yes",
      "lighthouse@12.6.0",
      url,
      "--only-categories=performance",
      "--output=json",
      "--output-path=stdout",
      "--quiet",
      "--chrome-flags=--headless=new --no-sandbox",
    ],
    { maxBuffer: 64 * 1024 * 1024, encoding: "utf8" }
  )
  const lhr = JSON.parse(out)
  const a = lhr.audits
  return {
    score: Math.round((lhr.categories.performance.score ?? 0) * 100),
    lcp: a["largest-contentful-paint"].numericValue,
    cls: a["cumulative-layout-shift"].numericValue,
    tbt: a["total-blocking-time"].numericValue,
    lcpElement: a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet,
  }
}

const rows = []
const problems = []
for (const [name, path] of Object.entries(PAGES)) {
  console.log(`Lighthouse: ${name} (${path})…`)
  try {
    const r = lighthouse(BASE + path)
    rows.push({ name, path, ...r })
    if (r.lcp > POOR_LCP_MS) problems.push(`${name}: main content took ${(r.lcp / 1000).toFixed(1)}s to appear (poor is over 4s)`)
    if (r.cls > POOR_CLS) problems.push(`${name}: layout jumps around while loading (CLS ${r.cls.toFixed(2)}, poor is over 0.25)`)
  } catch (err) {
    problems.push(`${name}: Lighthouse could not run (${String(err.message).split("\n")[0]})`)
  }
}

let md = `## Performance (Lighthouse, mobile) — ${BASE}\n\n| Page | Score | Main content shown (LCP) | Layout shift (CLS) | Blocking time |\n| --- | --- | --- | --- | --- |\n`
for (const r of rows) {
  md += `| [${r.name}](${BASE + r.path}) | ${r.score} | ${(r.lcp / 1000).toFixed(1)}s | ${r.cls.toFixed(2)} | ${Math.round(r.tbt)}ms |\n`
}
md += problems.length ? `\n**${problems.length} problem(s):**\n\n${problems.map((p) => `- ${p}`).join("\n")}\n` : "\nNo pages in the poor band.\n"

writeFileSync("site-check-lighthouse.md", md)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n")
console.log("\n" + md)
process.exit(problems.length ? 1 : 0)
