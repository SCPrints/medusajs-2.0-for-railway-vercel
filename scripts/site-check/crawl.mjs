#!/usr/bin/env node
// Read-only crawl of the live storefront. Visits every URL in the sitemap plus
// every internal link found on those pages, and reports anything broken.
//
//   node scripts/site-check/crawl.mjs [baseUrl]      (default https://www.scprints.com.au)
//   LIMIT=50 node scripts/site-check/crawl.mjs       (first 50 sitemap URLs only)
//
// Writes site-check-crawl.md (also appended to the GitHub job summary) and
// exits 1 when anything is found, so the scheduled workflow goes red.

import { appendFileSync, writeFileSync } from "node:fs"

const BASE = (process.argv[2] || "https://www.scprints.com.au").replace(/\/$/, "")
const LIMIT = Number(process.env.LIMIT) || Infinity
const CONCURRENCY = 4 // ponytail: gentle on Vercel's runtime cache; raise if runs get slow
const SLOW_MS = 8000
const TIMEOUT_MS = 30000
const UA = "SCPrints-SiteCheck/1.0 (+https://scprints.com.au)"

// The not-found page's title. PPR can serve it with a 200. (Its body text is
// in every page's RSC payload, so only the <title> is a reliable marker.)
const SOFT_404 = ["<title>404"]
const ERROR_TEXT = ["Product page failed to render", "Application error: a server-side exception"]

async function get(url, timeoutMs = TIMEOUT_MS) {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    })
    const html = /html|xml/.test(res.headers.get("content-type") || "") ? await res.text() : ""
    return { status: res.status, ms: Date.now() - started, finalUrl: res.url, html }
  } catch (err) {
    return { status: 0, ms: Date.now() - started, error: err.name === "TimeoutError" ? "timed out" : err.message, html: "" }
  }
}

async function pool(items, fn) {
  let i = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < items.length) await fn(items[i++])
    })
  )
}

function internalLinks(html) {
  const out = new Set()
  for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="([^"#]+)"/g)) {
    const h = href.replaceAll("&amp;", "&")
    if (!h.startsWith("/") || h.startsWith("//")) continue
    if (/^\/(_next|api)\//.test(h) || h.includes("?")) continue // assets + facet URLs
    out.add(BASE + h)
  }
  return out
}

const problems = [] // { kind, url, detail, foundOn? }
const add = (kind, url, detail, foundOn) => problems.push({ kind, url, detail, foundOn })

function check(url, r, foundOn) {
  if (r.status === 0) return add("Unreachable", url, r.error, foundOn)
  if (r.status >= 400) return add(`HTTP ${r.status}`, url, "", foundOn)
  if (SOFT_404.some((t) => r.html.includes(t))) return add("Shows 404 page (status 200)", url, "", foundOn)
  if (ERROR_TEXT.some((t) => r.html.includes(t))) return add("Error page", url, "", foundOn)
  if (r.ms > SLOW_MS) add("Slow", url, `${(r.ms / 1000).toFixed(1)}s`, foundOn)
}

// The sitemap is built from the whole catalog on a cache miss and can take
// well over 30s cold, so it gets a longer timeout and one retry.
let sitemap = await get(`${BASE}/sitemap.xml`, 120000)
if (sitemap.status !== 200) sitemap = await get(`${BASE}/sitemap.xml`, 120000)
if (sitemap.status !== 200) {
  const md = `## Site crawl — ${BASE}\n\nCould not load sitemap.xml (${sitemap.error || `HTTP ${sitemap.status}`}), so no pages were checked.\n`
  writeFileSync("site-check-crawl.md", md)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
  console.error(md)
  process.exit(1)
}
const urls = [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replaceAll("&amp;", "&")).slice(0, LIMIT)
// The sitemap may list a different host (e.g. www.) — crawl the base we were given.
const toBase = (u) => BASE + new URL(u).pathname
const sitemapSet = new Set(urls.map(toBase))
console.log(`Crawling ${sitemapSet.size} sitemap URLs on ${BASE}…`)

const linkSources = new Map() // link -> first page it was seen on
let done = 0
await pool([...sitemapSet], async (url) => {
  const r = await get(url)
  check(url, r)
  if (r.status === 200 && /<meta[^>]+name="robots"[^>]+noindex/i.test(r.html)) {
    add("In sitemap but marked noindex", url, "")
  }
  for (const link of internalLinks(r.html)) {
    if (!sitemapSet.has(link) && !linkSources.has(link)) linkSources.set(link, url)
  }
  if (++done % 100 === 0) console.log(`  ${done}/${sitemapSet.size}`)
})

console.log(`Checking ${linkSources.size} internal links not in the sitemap…`)
await pool([...linkSources.keys()], async (link) => {
  const r = await get(link)
  // Links only matter if they're broken; slowness is already covered above.
  if (r.status === 0 || r.status >= 400 || SOFT_404.some((t) => r.html.includes(t))) {
    check(link, { ...r, ms: 0 }, linkSources.get(link))
  }
})

const rel = (u) => u.replace(BASE, "") || "/"
let md = `## Site crawl — ${BASE}\n\nChecked ${sitemapSet.size} sitemap pages and ${linkSources.size} other internal links.\n\n`
if (!problems.length) {
  md += "No problems found.\n"
} else {
  md += `**${problems.length} problem(s):**\n\n| Problem | Page | Detail | Linked from |\n| --- | --- | --- | --- |\n`
  for (const p of problems.sort((a, b) => a.kind.localeCompare(b.kind))) {
    md += `| ${p.kind} | ${rel(p.url)} | ${p.detail || ""} | ${p.foundOn ? rel(p.foundOn) : ""} |\n`
  }
}
writeFileSync("site-check-crawl.md", md)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n")
console.log("\n" + md)
process.exit(problems.length ? 1 : 0)
