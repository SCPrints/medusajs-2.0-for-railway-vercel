#!/usr/bin/env node
// Pulls the last 24h of problems real visitors hit and groups repeats:
//   - Vercel: storefront server errors (production runtime logs, level=error)
//   - PostHog: browser errors ($exception), rage clicks, stalled navigations
//
// Env: POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID (+ POSTHOG_HOST),
//      VERCEL_TOKEN (CI only; locally the logged-in Vercel CLI is used).
//      SINCE_HOURS (default 24).
// Writes site-check-errors.md (+ job summary). A missing source is reported
// in the file rather than failing, so the other source still gets through.

import { execFileSync } from "node:child_process"
import { appendFileSync, writeFileSync } from "node:fs"

const HOURS = Number(process.env.SINCE_HOURS) || 24
const VERCEL_TEAM = "team_JwvzvbWe0eWmOdH8tESXdC35"
const VERCEL_PROJECT = "prj_fp8ekwq8VV4lhJi7UiGXsG7kpWrF"
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 160)

// ── Vercel ───────────────────────────────────────────────────────────────
// The CLI returns at most 50 lines per call whatever --limit says, so page
// backwards with --until. ponytail: capped at 40 pages (2,000 lines) a day.
function vercelLogLines() {
  const lines = []
  let until = null
  for (let page = 0; page < 40; page++) {
    const args = [
      "--yes", "vercel@53.2.0", "logs",
      "--scope", VERCEL_TEAM, "--project", VERCEL_PROJECT,
      "--environment", "production", "--no-branch", "--level", "error",
      "--since", `${HOURS}h`, "--limit", "100", "--json", "--non-interactive",
    ]
    if (until) args.push("--until", until)
    if (process.env.VERCEL_TOKEN) args.push("--token", process.env.VERCEL_TOKEN)
    const out = execFileSync("npx", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })
    const batch = out.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l))
    lines.push(...batch)
    if (batch.length < 50) break
    until = new Date(Math.min(...batch.map((l) => l.timestamp)) - 1).toISOString()
  }
  return lines
}

function vercelErrors() {
  const groups = new Map()
  for (const l of vercelLogLines()) {
    // First line of the message, with ids/hashes blanked so repeats group together.
    const key = (l.message || "(no message)").split("\n")[0].replace(/\b[0-9a-f]{8,}\b/gi, "…")
    const g = groups.get(key) ?? { count: 0, paths: new Set(), last: 0 }
    g.count++
    if (l.requestPath) g.paths.add(l.requestPath)
    g.last = Math.max(g.last, l.timestamp)
    groups.set(key, g)
  }
  return [...groups].sort((a, b) => b[1].count - a[1].count)
}

// ── PostHog ──────────────────────────────────────────────────────────────
async function hogql(query) {
  const host = process.env.POSTHOG_HOST || "https://us.i.posthog.com"
  const res = await fetch(`${host}/api/projects/${process.env.POSTHOG_PROJECT_ID}/query/`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  })
  if (!res.ok) throw new Error(`PostHog ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).results
}

const since = `timestamp > now() - INTERVAL ${HOURS} HOUR`
const posthogQueries = {
  exceptions: `SELECT properties.$exception_types AS type, properties.$exception_values AS message,
      count() AS n, uniq(person_id) AS people, groupUniqArray(3)(properties.$pathname) AS paths
    FROM events WHERE event = '$exception' AND ${since}
    GROUP BY type, message ORDER BY n DESC LIMIT 30`,
  rageclicks: `SELECT properties.$pathname AS path, arrayStringConcat(elements_chain_texts, ' / ') AS clicked,
      count() AS n, uniq(person_id) AS people
    FROM events WHERE event = '$rageclick' AND ${since}
    GROUP BY path, clicked ORDER BY n DESC LIMIT 30`,
  stalled: `SELECT properties.$pathname AS path, count() AS n, uniq(person_id) AS people
    FROM events WHERE event = 'navigation_stalled' AND ${since}
    GROUP BY path ORDER BY n DESC LIMIT 30`,
}
const unjson = (s) => {
  try { return JSON.parse(s).join(", ") } catch { return s }
}

// ── Report ───────────────────────────────────────────────────────────────
let md = `## Visitor errors — last ${HOURS}h\n\n`

md += "### Server errors (Vercel)\n\n"
try {
  const rows = vercelErrors()
  md += rows.length
    ? `| Times | Error | Pages |\n| --- | --- | --- |\n` +
      rows.map(([msg, g]) => `| ${g.count} | ${cell(msg)} | ${cell([...g.paths].slice(0, 3).join(", "))} |`).join("\n") + "\n\n"
    : "None.\n\n"
} catch (err) {
  md += `Could not read Vercel logs: ${cell(err.stderr || err.message)}\n\n`
}

if (!process.env.POSTHOG_PERSONAL_API_KEY || !process.env.POSTHOG_PROJECT_ID) {
  md += "### PostHog\n\nSkipped: POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID not set.\n"
} else {
  try {
    const [exceptions, rageclicks, stalled] = await Promise.all(Object.values(posthogQueries).map(hogql))
    md += "### Browser errors (PostHog)\n\n" + (exceptions.length
      ? `| Times | People | Error | Pages |\n| --- | --- | --- | --- |\n` +
        exceptions.map(([t, m, n, p, paths]) => `| ${n} | ${p} | ${cell(`${unjson(t)}: ${unjson(m)}`)} | ${cell(paths.join(", "))} |`).join("\n") + "\n\n"
      : "None.\n\n")
    md += "### Rage clicks (PostHog)\n\n" + (rageclicks.length
      ? `| Times | People | Page | Clicked on |\n| --- | --- | --- | --- |\n` +
        rageclicks.map(([path, clicked, n, p]) => `| ${n} | ${p} | ${cell(path)} | ${cell(clicked) || "(no text)"} |`).join("\n") + "\n\n"
      : "None.\n\n")
    md += "### Pages that stalled after a click (PostHog)\n\n" + (stalled.length
      ? `| Times | People | Page |\n| --- | --- | --- |\n` +
        stalled.map(([path, n, p]) => `| ${n} | ${p} | ${cell(path)} |`).join("\n") + "\n"
      : "None.\n")
  } catch (err) {
    md += `### PostHog\n\nCould not query PostHog: ${cell(err.message)}\n`
  }
}

writeFileSync("site-check-errors.md", md)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n")
console.log(md)
